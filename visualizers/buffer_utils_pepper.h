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

#ifndef PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_BUFFER_UTILS_PEPPER_H_
#define PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_BUFFER_UTILS_PEPPER_H_

#include "ppapi/cpp/var.h"
#include "ppapi/cpp/var_array_buffer.h"
#include "ppapi/cpp/var_dictionary.h"
#include "HalideRuntime.h"

namespace packaged_call_runtime {
namespace pepper {

class VarArrayBufferLocker {
 public:
  explicit VarArrayBufferLocker(const pp::VarArrayBuffer& ab)
      : ab_(ab), ptr_(ab_.Map()) {}
  ~VarArrayBufferLocker() { ab_.Unmap(); }
  void* GetPtr() const { return ptr_; }

 private:
  pp::VarArrayBuffer ab_;
  void* ptr_;

  // Unimplemented
  explicit VarArrayBufferLocker(const VarArrayBufferLocker&);
  VarArrayBufferLocker& operator=(const VarArrayBufferLocker&);
};

bool BufferToDict(const buffer_t* buf,
                  const std::string& type_code,
                  const int dimensions,
                  pp::VarDictionary* dict);
bool DictToBuffer(const pp::VarDictionary& dict,
                  VarArrayBufferLocker** locked_buffer,
                  std::string* type_code,
                  int* dimensions,
                  buffer_t* buf);

}  // namespace pepper
}  // namespace packaged_call_runtime

#endif  // PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_BUFFER_UTILS_PEPPER_H_
