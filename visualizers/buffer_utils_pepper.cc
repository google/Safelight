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

#if defined(__native_client__)

#include "visualizers/buffer_utils_pepper.h"
#include <string.h>  // for memcpy

namespace packaged_call_runtime {
namespace pepper {
namespace {

bool ExtractString(const pp::VarDictionary& dict, const char* name,
                   std::string* result) {
  if (!dict.HasKey(name)) return false;
  pp::Var v = dict.Get(name);
  if (!v.is_string()) return false;
  *result = v.AsString();
  return true;
}

bool ExtractInt(const pp::VarDictionary& dict, const char* name, int* result) {
  if (!dict.HasKey(name)) return false;
  pp::Var v = dict.Get(name);
  if (!v.is_number()) return false;
  *result = v.AsInt();
  return true;
}

bool ExtractIntArray4(const pp::VarDictionary& dict, const char* name,
                      int32_t result[4]) {
  if (!dict.HasKey(name)) return false;
  pp::Var v = dict.Get(name);
  if (!v.is_array()) return false;
  pp::VarArray a(v);
  if (a.GetLength() != 4) return false;
  for (int i = 0; i < 4; ++i) {
    if (!a.Get(i).is_number()) return false;
    result[i] = static_cast<int32_t>(a.Get(i).AsInt());
  }
  return true;
}

bool ExtractDataBuffer(const pp::VarDictionary& dict, const char* name,
                       VarArrayBufferLocker** locked_buffer) {
  *locked_buffer = NULL;
  if (!dict.HasKey(name)) return false;
  pp::Var data = dict.Get(name);
  if (!data.is_array_buffer()) return false;
  *locked_buffer = new VarArrayBufferLocker(pp::VarArrayBuffer(data));
  return true;
}

}  // namespace

bool BufferToDict(const buffer_t* buf,
                  const std::string& type_code,
                  const int dimensions,
                  pp::VarDictionary* dict) {
  size_t bytes = buf->elem_size;
  for (int i = 0; i < 4; ++i) {
    // TODO(srj): this is only correct if there is no padding anywhere
    if (buf->extent[i]) {
      bytes *= buf->extent[i];
    }
  }
  pp::VarArrayBuffer dst_storage(bytes);
  {
    VarArrayBufferLocker locker(dst_storage);
    memcpy(locker.GetPtr(), buf->host, bytes);
  }
  pp::VarArray extent, stride, min;
  for (int i = 0; i < 4; ++i) {
    if (!extent.Set(i, pp::Var(buf->extent[i]))) return false;
    if (!stride.Set(i, pp::Var(buf->stride[i]))) return false;
    if (!min.Set(i, pp::Var(buf->min[i]))) return false;
  }
  if (!dict->Set("elem_size", pp::Var(buf->elem_size)) ||
      !dict->Set("extent", extent) ||
      !dict->Set("stride", stride) ||
      !dict->Set("min", min) ||
      !dict->Set("dimensions", dimensions) ||
      !dict->Set("type_code", type_code) ||
      !dict->Set("host", dst_storage)) {
    return false;
  }
  return true;
}

bool DictToBuffer(const pp::VarDictionary& dict,
                  VarArrayBufferLocker** locked_buffer,
                  std::string* type_code,
                  int* dimensions,
                  buffer_t* buf) {
  *locked_buffer = NULL;
  *buf = buffer_t();
  if (!ExtractInt(dict, "elem_size", &buf->elem_size) ||
      !ExtractIntArray4(dict, "extent", buf->extent) ||
      !ExtractIntArray4(dict, "stride", buf->stride) ||
      !ExtractIntArray4(dict, "min", buf->min) ||
      !ExtractInt(dict, "dimensions", dimensions) ||
      !ExtractString(dict, "type_code", type_code) ||
      !ExtractDataBuffer(dict, "host", locked_buffer)) {
    return false;
  }
  buf->host = static_cast<uint8_t*>((*locked_buffer)->GetPtr());
  return true;
}

}  // namespace pepper
}  // namespace packaged_call_runtime

#endif  // defined(__native_client__)

