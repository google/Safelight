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
#include <cstring>
#include <sstream>

#include "visualizers/buffer_utils_pepper.h"
#include "visualizers/nexe_verb_handler.h"
#include "visualizers/rgba8_visualizer.h"
#include "visualizers/transmogrify_rgba8.h"
#include "ppapi/cpp/module.h"
#include "ppapi/cpp/var.h"
#include "ppapi/cpp/var_dictionary.h"
#include "HalideRuntime.h"

namespace {

using packaged_call_runtime::pepper::BufferToDict;
using packaged_call_runtime::pepper::DictToBuffer;
using packaged_call_runtime::pepper::VarArrayBufferLocker;
using packaged_call_runtime::NexeVerbHandlerInstance;
using packaged_call_runtime::RGBA8Visualizer;
using packaged_call_runtime::TransmogrifyRGBA8;

// Can't rely on C++11 here, thus we can't use unique_ptr :-/
struct VarArrayBufferLockerPtr {
  VarArrayBufferLocker* locker;
  VarArrayBufferLockerPtr() : locker(NULL) {}
  ~VarArrayBufferLockerPtr() { delete locker; }
};

class VisualizersInstance : public NexeVerbHandlerInstance {
 public:
  explicit VisualizersInstance(PP_Instance instance)
      : NexeVerbHandlerInstance(instance) {}

 protected:
  virtual void HandleVerb(const std::string& verb,
                          const pp::VarDictionary& message) {
    if (verb == "visualize") {
      if (!VisualizeRGBA8(message)) {
        Failure("visualize failure");
      }
    } else if (verb == "transmogrify") {
      if (!Transmogrify(message)) {
        Failure("transmogrify failure");
      }
    } else {
      Failure("unknown verb");
    }
  }

 private:
  bool Transmogrify(const pp::VarDictionary& d) {
    if (!d.HasKey("buffer")) return false;
    pp::VarDictionary input_dict(d.Get("buffer"));

    buffer_t input;
    std::string input_type_code;
    int input_dimensions;
    VarArrayBufferLockerPtr locked_buffer;
    if (!DictToBuffer(input_dict, &locked_buffer.locker, &input_type_code,
                      &input_dimensions, &input)) return false;

    if (!d.HasKey("type_code") ||
        !d.HasKey("type_bits") ||
        !d.HasKey("dimensions")) return false;
    std::string type_code = d.Get("type_code").AsString();
    int type_bits = d.Get("type_bits").AsInt();
    int dimensions = d.Get("dimensions").AsInt();

    buffer_t output = buffer_t();
    output.elem_size = type_bits / 8;
    size_t storage = output.elem_size;
    for (int i = 0; i < dimensions; ++i) {
      output.min[i] = input.min[i];
      output.extent[i] = std::max(1, input.extent[i]);
      output.stride[i] =
          (i == 0) ? 1 : output.stride[i - 1] * output.extent[i - 1];
      storage *= output.extent[i];
    }
    std::vector<uint8_t> output_storage(storage);
    output.host = &output_storage[0];

    std::ostringstream type;
    type << type_code << type_bits;
    if (TransmogrifyRGBA8(NULL, type.str().c_str(), &input, &output) != 0) {
      return false;
    }

    pp::VarDictionary output_dict;
    if (!BufferToDict(&output, type_code, dimensions, &output_dict)) {
      return false;
    }

    std::string accuracy;
    if (type.str() == "uint8" && dimensions <= 3) {
      accuracy = "exact";
    } else {
      accuracy = "inexact";
    }

    pp::VarDictionary message;
    message.Set("buffer", output_dict);
    message.Set("accuracy", accuracy);
    Success(message);
    return true;
  }

  bool VisualizeRGBA8(const pp::VarDictionary& d) {
    if (!d.HasKey("visualizer")) return false;
    pp::Var v = d.Get("visualizer");
    if (!v.is_string() || v.AsString() != "rgba8") return false;

    if (!d.HasKey("buffer")) return false;
    pp::VarDictionary input(d.Get("buffer"));

    buffer_t buf;
    std::string input_type_code;
    int input_dimensions;
    VarArrayBufferLockerPtr locked_buffer;
    if (!DictToBuffer(input, &locked_buffer.locker, &input_type_code,
                      &input_dimensions, &buf)) return false;

    buffer_t rgba8 = buffer_t();
    rgba8.elem_size = 1;
    rgba8.min[0] = buf.min[0];
    rgba8.min[1] = buf.min[1];
    rgba8.min[2] = buf.min[2];
    rgba8.extent[0] = std::max(1, buf.extent[0]);
    rgba8.extent[1] = std::max(1, buf.extent[1]);
    rgba8.extent[2] = 4;
    rgba8.stride[0] = 4;
    rgba8.stride[1] = rgba8.extent[0] * 4;
    rgba8.stride[2] = 1;
    std::vector<uint8_t> rgba8_storage(rgba8.extent[0] * rgba8.extent[1] *
                                       rgba8.extent[2]);
    rgba8.host = &rgba8_storage[0];

    std::ostringstream type;
    type << input_type_code << (buf.elem_size * 8);
    if (RGBA8Visualizer(NULL, type.str().c_str(), &buf, &rgba8) != 0) {
      return false;
    }

    pp::VarDictionary rgba8_dict;
    if (!BufferToDict(&rgba8, "uint", 3, &rgba8_dict)) return false;

    std::string accuracy;
    if (type.str() == "uint8" && input_dimensions <= 3) {
      accuracy = "exact";
    } else {
      accuracy = "inexact";
    }

    pp::VarDictionary message;
    message.Set("buffer", rgba8_dict);
    message.Set("accuracy", accuracy);
    Success(message);
    return true;
  }
};

class VisualizersModule : public pp::Module {
 public:
  VisualizersModule() : pp::Module() {}

  virtual pp::Instance* CreateInstance(PP_Instance instance) {
    return new VisualizersInstance(instance);
  }
};

}  // namespace

namespace pp {
// There is one Module object per web page, and one Instance per <embed> element
Module* CreateModule() { return new VisualizersModule(); }
}  // namespace pp

extern "C" void halide_error(void* /* user_context */, const char* msg) {
  NexeVerbHandlerInstance::AttemptFailure(msg);
}
#else
// Provide a stub 'main' so that :all targets will build.
int main() {
  return 1;
}
#endif  // #if defined(__native_client__)
