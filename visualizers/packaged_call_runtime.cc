/*
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "visualizers/packaged_call_runtime.h"

#include <ctime>
#include <sstream>

#include "copy_image_uint8_filter.h"
#include "copy_image_uint16_filter.h"
#include "copy_image_float32_filter.h"

namespace packaged_call_runtime {

using std::string;
using std::unique_ptr;
using std::vector;

namespace {

static const char* kTypeCode[4] = {"int", "uint", "float", "handle"};

int CopyImageInvalid(buffer_t* src, buffer_t* dst) { return -1; }

// Calculate the maximum number of elements needed for the buffer.
// This can be larger than extents[] would imply if stride[] is padded
// or otherwise nonstandard. (e.g.: if rows are padded to 32-byte increments,
// as is done by PixelBytes, stride[1] will be padded to a multiple of 32
// regardless of the value of extent[1], and allocating size based solely
// on extent will produce a result that is too small.)
size_t MaxElemCount(int dim, const buffer_t& buf) {
  size_t count = 1;
  for (int i = 0; i < dim; ++i) {
    count += (buf.extent[i] - 1) * buf.stride[i];
  }
  return count;
}

int64_t GetTimeUsec() {
  timespec t;
  clock_gettime(CLOCK_REALTIME, &t);
  return t.tv_sec * 1000000 + t.tv_nsec / 1000;
}

void ChooseOutputExtents(const halide_filter_metadata_t* metadata,
                         const ArgumentPackager::ArgValue* arg_values,
                         int32_t output_extent[4]) {
  const int num_args = metadata->num_arguments;
  const halide_filter_argument_t* args = metadata->arguments;

  for (int i = 0; i < num_args; ++i) {
    if (args[i].type_code == halide_argument_kind_input_buffer) {
      for (int e = 0; e < 4; ++e) {
        output_extent[e] = arg_values[i].buffer.extent[e];
      }
      return;
    }
  }

  output_extent[0] = 100;
  output_extent[1] = 100;
  output_extent[2] = 4;
  output_extent[3] = 0;
}

void FixChunkyStrides(int dim, const buffer_t& constraint, buffer_t* buf) {
  // Special-case Chunky: most "chunky" generators tend to constrain stride[0]
  // and stride[2] to exact values, leaving stride[1] unconstrained;
  // in practice, we must ensure that stride[1] == stride[0] * extent[0]
  // and stride[0] = extent[2] to get results that are not garbled.
  // This is unpleasantly hacky and will likely need aditional enhancements.
  // (Note that there are, theoretically, other stride combinations that might
  // need fixing; in practice, ~all generators that aren't planar tend
  // to be classically chunky.)
  if (dim >= 3) {
    if (constraint.stride[2] == 1) {
      if (constraint.stride[0] >= 1) {
        // If we have stride[0] and stride[2] set to obviously-chunky,
        // then force extent[2] to match stride[0].
        buf->extent[2] = constraint.stride[0];
      } else {
        // If we have stride[2] == 1 but stride[0] <= 1,
        // force stride[0] = extent[2]
        buf->stride[0] = buf->extent[2];
      }
      // Ensure stride[1] is reasonable.
      buf->stride[1] = buf->extent[0] * buf->stride[0];
    }
  }
}

bool AdaptInputBufferLayout(const halide_filter_argument_t& arg,
                            const buffer_t& constraint, buffer_t* buf,
                            vector<uint8_t>* storage) {
  const buffer_t buf_original = *buf;
  bool need_copy = false;
  for (int i = 0; i < arg.dimensions; ++i) {
    // min of nonzero means "min"
    if (constraint.min[i] != 0 && buf->min[i] > constraint.min[i]) {
      buf->min[i] = constraint.min[i];
      need_copy = true;
    }
    // extent of nonzero means "max"
    if (constraint.extent[i] != 0 && buf->extent[i] > constraint.extent[i]) {
      buf->extent[i] = constraint.extent[i];
      need_copy = true;
    }
    // stride of 0 means "no constraints"
    if (constraint.stride[i] != 0 && constraint.stride[i] != buf->stride[i]) {
      buf->stride[i] = constraint.stride[i];
      need_copy = true;
    }
  }
  if (need_copy) {
    FixChunkyStrides(arg.dimensions, constraint, buf);
    size_t bytes = buf->elem_size * MaxElemCount(arg.dimensions, *buf);
    storage->resize(bytes, 0);
    if (storage->size() != bytes) return false;
    buf->host = &(*storage)[0];
    buf->dev = 0;
    if (!packaged_call_runtime::Copy(&buf_original, buf)) {
      return false;
    }
  } else {
    storage->resize(0);
  }
  return true;
}

bool PrepareOutputBuffer(const halide_filter_argument_t& arg,
                         const buffer_t& constraint, buffer_t* buf,
                         vector<uint8_t>* storage) {
  *buf = constraint;
  // constraint can have zero values within buffer_dimensions,
  // e.g. if a dimension has no constraints on it at all. Make
  // sure that the extents and strides for these are nonzero.
  for (int i = 0; i < arg.dimensions; ++i) {
    if (!buf->extent[i]) {
      // A bit of a hack: fill in unconstrained dimensions to 1... except
      // for probably-the-channels dimension, which we'll special-case to
      // fill in to 4 when possible (unless it appears to be chunky).
      // (stride will be fixed below.)
      if (i == 2) {
        if (constraint.stride[0] >= 1 && constraint.stride[2] == 1) {
          // Definitely chunky, so make extent[2] match the chunk size
          buf->extent[i] = constraint.stride[0];
        } else {
          // Not obviously chunky; let's go with 4 channels.
          buf->extent[i] = 4;
        }
      } else {
        buf->extent[i] = 1;
      }
    }
  }
  FixChunkyStrides(arg.dimensions, constraint, buf);

  // If anything else is zero, just set strides to planar and hope for the best.
  bool zero_strides = false;
  for (int i = 0; i < arg.dimensions; ++i) {
    if (!buf->stride[i]) zero_strides = true;
  }
  if (zero_strides) {
    // Planar
    buf->stride[0] = 1;
    for (int i = 1; i < arg.dimensions; ++i) {
      buf->stride[i] = buf->stride[i - 1] * buf->extent[i - 1];
    }
  }
  buf->elem_size = arg.type_bits / 8;
  size_t bytes = buf->elem_size * MaxElemCount(arg.dimensions, *buf);
  storage->resize(bytes);
  if (storage->size() != bytes) return false;
  buf->host = storage->data();
  buf->dev = 0;
  return true;
}

bool EmitScalar(std::ostream* oss, int type_code, int type_bits,
                const halide_scalar_value_t& scalar) {
#define TYPE_AND_SIZE(CODE, BITS) (((CODE) << 8) | (BITS))
  switch (TYPE_AND_SIZE(type_code, type_bits)) {
    case TYPE_AND_SIZE(halide_type_float, 32):
      *oss << scalar.u.f32;
      return true;
    case TYPE_AND_SIZE(halide_type_float, 64):
      *oss << scalar.u.f64;
      return true;
    case TYPE_AND_SIZE(halide_type_int, 8):
      // emit as number, not char
      *oss << static_cast<int>(scalar.u.i8);
      return true;
    case TYPE_AND_SIZE(halide_type_int, 16):
      *oss << scalar.u.i16;
      return true;
    case TYPE_AND_SIZE(halide_type_int, 32):
      *oss << scalar.u.i32;
      return true;
    case TYPE_AND_SIZE(halide_type_int, 64):
      *oss << scalar.u.i64;
      return true;
    case TYPE_AND_SIZE(halide_type_uint, 1):
      *oss << (scalar.u.b ? "true" : "false");
      return true;
    case TYPE_AND_SIZE(halide_type_uint, 8):
      // emit as number, not char
      *oss << static_cast<unsigned int>(scalar.u.u8);
      return true;
    case TYPE_AND_SIZE(halide_type_uint, 16):
      *oss << scalar.u.u16;
      return true;
    case TYPE_AND_SIZE(halide_type_uint, 32):
      *oss << scalar.u.u32;
      return true;
    case TYPE_AND_SIZE(halide_type_uint, 64):
      *oss << scalar.u.u64;
      return true;
    case TYPE_AND_SIZE(halide_type_handle, 64):
      // Handles are always emitted as literal 0.
      *oss << 0;
      return true;
    default:
      return false;
  }
#undef TYPE_AND_SIZE
}

int EnumerateFilters(void* enumerate_context,
                     const halide_filter_metadata_t* metadata,
                     ArgvFunc argv_func) {
  HalideFilterInfoMap* m =
      reinterpret_cast<HalideFilterInfoMap*>(enumerate_context);
  m->emplace(std::pair<string, HalideFilterInfo>(metadata->name,
                                                 {metadata, argv_func}));
  return 0;
}

}  // namespace

bool Copy(const buffer_t* src, buffer_t* dst) {
  typedef int (*CopyImageFunc)(buffer_t*, buffer_t*);

  static const CopyImageFunc kCopyFuncs[4] = {
      // elem_size = 1
      copy_image_uint8_filter,
      // elem_size = 2
      copy_image_uint16_filter,
      // elem_size = 3
      CopyImageInvalid,
      // elem_size = 4
      copy_image_float32_filter,
  };
  const int elem_size = (src->elem_size - 1) & 3;

  if (src->elem_size > 4 || src->elem_size != dst->elem_size) {
    return false;
  }

  // copy_image_xxx always operates on a 4-dimensional image;
  // if we have fewer than that, add extra dimensions with extent 1
  // to make the validity checks happy (memory layout will be the same).
  buffer_t src_4d = *src;
  buffer_t dst_4d = *dst;
  for (int i = 0; i < 4; ++i) {
    if (src_4d.extent[i] == 0) src_4d.extent[i] = 1;
    if (src_4d.stride[i] == 0) src_4d.stride[i] = 1;
    if (dst_4d.extent[i] == 0) dst_4d.extent[i] = 1;
    if (dst_4d.stride[i] == 0) dst_4d.stride[i] = 1;
  }

  return kCopyFuncs[elem_size](&src_4d, &dst_4d) == 0;
}

int MakePackagedCall(void* user_context,
                     const halide_filter_metadata_t* metadata,
                     ArgvFunc argv_func, ArgumentPackager* packager) {
  if (!metadata || !argv_func || !packager) return -6809;

  // All locals declared at top to allow for "goto fail" error handling.
  const int num_args = metadata->num_arguments;
  const halide_filter_argument_t* args = metadata->arguments;
  vector<void*> arg_value_ptrs(num_args);
  vector<ArgumentPackager::ArgValue> arg_values(num_args);
  vector<ArgumentPackager::ArgValue> bounds_query_arg_values(num_args);
  vector<vector<uint8_t>> buffer_storage(num_args);
  int32_t output_extent[4] = {0};
  int bounds_query_status = 0, call_status = 0;
  double time_usec = 0.0;

  for (int i = 0; i < num_args; ++i) {
    if (args[i].kind == halide_argument_kind_output_buffer) continue;
    if (!packager->UnpackArgumentValue(user_context, args[i], &arg_values[i])) {
      goto fail;
    }
  }

  ChooseOutputExtents(metadata, &arg_values[0], output_extent);

  // Prep copy of arguments buffers, but with nulled host/dev in all buffers
  // for bounds-query mode, and reasonable extents set in the output
  // output buffers.
  bounds_query_arg_values = arg_values;
  for (int i = 0; i < num_args; ++i) {
    switch (args[i].kind) {
      case halide_argument_kind_output_buffer: {
        for (int e = 0; e < 4; ++e) {
          bounds_query_arg_values[i].buffer.extent[e] =
              (e < args[i].dimensions) ? output_extent[e] : 0;
        }
        break;
      }
      case halide_argument_kind_input_buffer: {
        bounds_query_arg_values[i].buffer.host = NULL;
        bounds_query_arg_values[i].buffer.dev = 0;
        break;
      }
    }
  }

  for (int i = 0; i < num_args; ++i) {
    arg_value_ptrs[i] = &bounds_query_arg_values[i];
  }
  bounds_query_status = argv_func(&arg_value_ptrs[0]);
  if (bounds_query_status != 0) {
    // Don't emit our own halide_error or custom error code;
    // halide_error has already been called, so just return the failure
    // code as-is.
    return bounds_query_status;
  }

  for (int i = 0; i < num_args; ++i) {
    switch (args[i].kind) {
      case halide_argument_kind_input_buffer: {
        if (!AdaptInputBufferLayout(args[i], bounds_query_arg_values[i].buffer,
                                    &arg_values[i].buffer,
                                    &buffer_storage[i])) {
          goto fail;
        }
        break;
      }
      case halide_argument_kind_output_buffer: {
        if (!PrepareOutputBuffer(args[i], bounds_query_arg_values[i].buffer,
                                 &arg_values[i].buffer, &buffer_storage[i])) {
          goto fail;
        }
        break;
      }
    }
  }

  {
    for (int i = 0; i < num_args; ++i) {
      arg_value_ptrs[i] = &arg_values[i];
    }
    const int64_t kTimeStart = GetTimeUsec();
    call_status = argv_func(&arg_value_ptrs[0]);
    if (call_status != 0) {
      // Don't emit our own halide_error or custom error code;
      // halide_error has already been called, so just return the failure
      // code as-is.
      return call_status;
    }
    const int64_t kTimeEnd = GetTimeUsec();
    time_usec = kTimeEnd - kTimeStart;
  }

  if (!packager->PackResultTimeUsec(time_usec)) {
    goto fail;
  }
  for (int i = 0; i < num_args; ++i) {
    if (args[i].kind != halide_argument_kind_output_buffer) continue;
    if (!packager->PackResultValue(args[i], arg_values[i])) {
      goto fail;
    }
  }

  return 0;

fail:
  halide_error(user_context, "MakePackagedCall_Failure.");
  return -6502;
}

bool MetadataToJSON(const halide_filter_metadata_t* metadata, string* json) {
  if (!metadata || !json) return false;

  std::ostringstream oss;
  oss << "{"
      << "\"version\":" << metadata->version << ","
      << "\"target\":\"" << metadata->target << "\","
      << "\"name\":\"" << metadata->name << "\","
      << "\"arguments\":[";

  const size_t num_args = metadata->num_arguments;
  const halide_filter_argument_t* args = metadata->arguments;

  for (size_t i = 0; i < num_args; ++i) {
    const halide_filter_argument_t& arg = args[i];
    if (i > 0) oss << ",";
    oss << "{"
        << "\"name\":\"" << arg.name << "\","
        << "\"kind\":" << static_cast<int>(arg.kind) << ","
        << "\"type_code\":\"" << kTypeCode[arg.type_code] << "\","
        << "\"type_bits\":" << arg.type_bits;
    // JSON doesn't allow trailing commas.
    bool need_comma = true;
    if (arg.kind != halide_argument_kind_input_scalar) {
      if (need_comma) oss << ",";
      oss << "\"dimensions\":" << arg.dimensions;
      // unnecessary
      // need_comma = true;
    } else {
      if (arg.def) {
        if (need_comma) oss << ",";
        oss << "\"def\":";
        if (!EmitScalar(&oss, arg.type_code, arg.type_bits, *arg.def))
          return false;
        need_comma = true;
      }
      if (arg.min) {
        if (need_comma) oss << ",";
        oss << "\"min\":";
        if (!EmitScalar(&oss, arg.type_code, arg.type_bits, *arg.min))
          return false;
        need_comma = true;
      }
      if (arg.max) {
        if (need_comma) oss << ",";
        oss << "\"max\":";
        if (!EmitScalar(&oss, arg.type_code, arg.type_bits, *arg.max))
          return false;
        // unnecessary
        // need_comma = true;
      }
    }
    oss << "}";
  }
  oss << "]}";
  *json = oss.str();
  return true;
}

bool ArgumentPackagerJson::GetMemberAsInt32Array(
    const unique_ptr<JsonValue>& value, const string& name, const size_t len,
    int32_t* result) {
  unique_ptr<JsonValue> a = value->GetMember(name);
  std::vector<int> v;
  if (!a->AsInt32Array(&v) || v.size() != len) return false;
  for (size_t i = 0; i < len; ++i) {
    result[i] = static_cast<int32_t>(v[i]);
  }
  return true;
}

bool ArgumentPackagerJson::UnpackArgumentValue(
    void* user_context, const halide_filter_argument_t& a,
    ArgValue* arg_value) {
  if (a.kind == halide_argument_kind_output_buffer) return false;

  const JsonValue* var = GetInputMessage();
  if (!var->IsMap()) return false;

  unique_ptr<JsonValue> inputs = var->GetMember("inputs");
  if (!inputs->IsMap()) return false;

  if (a.type_code == halide_type_handle) {
    // user_context is always specified via an explicit arg to the packaged
    // call, never via the input message, and so should never be present
    // there: it's an error if we find one.
    if (!inputs->GetMember(a.name)->IsUndefined()) return false;
    arg_value->scalar.u.handle = user_context;
    return true;
  }

  unique_ptr<JsonValue> value = inputs->GetMember(a.name);
  if (value->IsUndefined()) return false;

  if (a.kind == halide_argument_kind_input_buffer) {
    // input buffer
    if (!value->IsMap()) return false;
    host_storage_.emplace_back(new vector<uint8_t>);
    vector<uint8_t>* storage = host_storage_.back().get();
    if (!value->GetMember("elem_size")->AsInt32(&arg_value->buffer.elem_size) ||
        !GetMemberAsInt32Array(value, "extent", 4, arg_value->buffer.extent) ||
        !GetMemberAsInt32Array(value, "stride", 4, arg_value->buffer.stride) ||
        !GetMemberAsInt32Array(value, "min", 4, arg_value->buffer.min) ||
        !value->GetMember("host")->AsByteArray(storage))
      return false;
    arg_value->buffer.host = storage->data();
    return true;
  }

#define TYPE_AND_SIZE(CODE, BITS) (((CODE) << 8) | (BITS))

  if (TYPE_AND_SIZE(a.type_code, a.type_bits) ==
      TYPE_AND_SIZE(halide_type_uint, 1)) {
    // bool is modeled as uint(1) in Halide
    return value->AsBool(&arg_value->scalar.u.b);
  }

  // JS doesn't really distinguish between numeric types, so we have to
  // play a bit loose here. Oh well.

  int32_t i;
  double d;
  switch (TYPE_AND_SIZE(a.type_code, a.type_bits)) {
    case TYPE_AND_SIZE(halide_type_float, 32):
      if (!value->AsDouble(&d)) return false;
      arg_value->scalar.u.f32 = static_cast<float>(d);
      return true;
    case TYPE_AND_SIZE(halide_type_float, 64):
      if (!value->AsDouble(&d)) return false;
      arg_value->scalar.u.f64 = static_cast<double>(d);
      return true;
    case TYPE_AND_SIZE(halide_type_int, 8):
      if (!value->AsInt32(&i)) return false;
      arg_value->scalar.u.i8 = static_cast<int8_t>(i);
      return true;
    case TYPE_AND_SIZE(halide_type_int, 16):
      if (!value->AsInt32(&i)) return false;
      arg_value->scalar.u.i16 = static_cast<int16_t>(i);
      return true;
    case TYPE_AND_SIZE(halide_type_int, 32):
      if (!value->AsInt32(&i)) return false;
      arg_value->scalar.u.i32 = static_cast<int32_t>(i);
      return true;
    case TYPE_AND_SIZE(halide_type_int, 64):
      if (!value->AsInt32(&i)) return false;
      arg_value->scalar.u.i64 = static_cast<int64_t>(i);
      return true;
    case TYPE_AND_SIZE(halide_type_uint, 8):
      if (!value->AsInt32(&i)) return false;
      arg_value->scalar.u.u8 = static_cast<uint8_t>(i);
      return true;
    case TYPE_AND_SIZE(halide_type_uint, 16):
      if (!value->AsInt32(&i)) return false;
      arg_value->scalar.u.u16 = static_cast<uint16_t>(i);
      return true;
    case TYPE_AND_SIZE(halide_type_uint, 32):
      if (!value->AsInt32(&i)) return false;
      arg_value->scalar.u.u32 = static_cast<uint32_t>(i);
      return true;
    case TYPE_AND_SIZE(halide_type_uint, 64):
      if (!value->AsInt32(&i)) return false;
      arg_value->scalar.u.u64 = static_cast<uint64_t>(i);
      return true;
    default:
      return false;
  }

#undef TYPE_AND_SIZE
}

bool ArgumentPackagerJson::PackResultValue(const halide_filter_argument_t& a,
                                           const ArgValue& arg_value) {
  if (a.kind != halide_argument_kind_output_buffer) return false;
  const buffer_t& buf = arg_value.buffer;

  unique_ptr<JsonValue> d = NewMap();
  if (!d->SetMember("elem_size", NewInt32(buf.elem_size)) ||
      !d->SetMember("extent", NewInt32Array(buf.extent, 4)) ||
      !d->SetMember("stride", NewInt32Array(buf.stride, 4)) ||
      !d->SetMember("min", NewInt32Array(buf.min, 4)) ||
      !d->SetMember("dimensions", NewInt32(a.dimensions)) ||
      !d->SetMember("type_code", NewString(kTypeCode[a.type_code])) ||
      !d->SetMember("host",
                    NewByteArray(buf.host, MaxElemCount(a.dimensions, buf)))) {
    return false;
  }

  JsonValue* results = GetOutputMessage();
  if (!results->IsMap()) return false;

  unique_ptr<JsonValue> outputs = results->GetMember("outputs");
  if (!outputs->IsMap()) {
    outputs = NewMap();
  }
  outputs->SetMember(a.name, d);
  results->SetMember("outputs", outputs);

  return true;
}

bool ArgumentPackagerJson::PackResultTimeUsec(double time_usec) {
  JsonValue* results = GetOutputMessage();
  if (!results->IsMap()) return false;
  if (!results->SetMember("time_usec", NewDouble(time_usec))) return false;
  return true;
}

bool BuildHalideFilterInfoMap(HalideFilterInfoMap* m) {
  m->clear();
  if (halide_enumerate_registered_filters(nullptr, m, EnumerateFilters) != 0) {
    m->clear();
    return false;
  }
  return true;
}

}  // namespace packaged_call_runtime
