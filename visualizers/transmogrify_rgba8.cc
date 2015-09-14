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

#include "visualizers/transmogrify_rgba8.h"
#include <map>
#include <string>
#include "transmogrify_rgba8_to_float32.h"
#include "transmogrify_rgba8_to_float64.h"
#include "transmogrify_rgba8_to_int16.h"
#include "transmogrify_rgba8_to_int32.h"
#include "transmogrify_rgba8_to_int8.h"
#include "transmogrify_rgba8_to_uint16.h"
#include "transmogrify_rgba8_to_uint32.h"
#include "transmogrify_rgba8_to_uint8.h"

namespace packaged_call_runtime {
namespace {

typedef int (*TransmogrifyFunc)(buffer_t* src,
                                int output_dimensions,
                                buffer_t* dst);

int StubTransmogrify(const void* user_context, buffer_t* src,
                     int output_dimensions, buffer_t* dst) {
  halide_error(const_cast<void*>(user_context),
                "StubTransmogrify should never be called");
  return -1;
}

// This file may not yet rely on C++11, so we'll build the static map
// with a helper function.
std::map<std::string, TransmogrifyFunc> BuildMap() {
  std::map<std::string, TransmogrifyFunc> m;
  m["float32"] = transmogrify_rgba8_to_float32;
  m["float64"] = transmogrify_rgba8_to_float64;
  m["int8"] = transmogrify_rgba8_to_int8;
  m["int16"] = transmogrify_rgba8_to_int16;
  m["int32"] = transmogrify_rgba8_to_int32;
  m["uint8"] = transmogrify_rgba8_to_uint8;
  m["uint16"] = transmogrify_rgba8_to_uint16;
  m["uint32"] = transmogrify_rgba8_to_uint32;
  return m;
}

}  // namespace

int TransmogrifyRGBA8(void* user_context,
                    const char* type,
                    buffer_t* src,
                    buffer_t* dst) {
  static std::map<std::string, TransmogrifyFunc> m = BuildMap();
  std::map<std::string, TransmogrifyFunc>::const_iterator it = m.find(type);
  if (it == m.end()) {
    halide_error(const_cast<void*>(user_context), "Unknown buffer type");
    return -1;
  }
  int output_dimensions = 0;
  // Artificially expand to 4 dimensions, adding stub dims as needed.
  buffer_t dst_fixed = *dst;
  for (int i = 0; i < 4; ++i) {
    if (dst_fixed.extent[i]) output_dimensions = i + 1;
    dst_fixed.extent[i] = std::max(1, dst_fixed.extent[i]);
    dst_fixed.stride[i] = std::max(1, dst_fixed.stride[i]);
  }
  return it->second(src, output_dimensions, &dst_fixed);
}

}  // namespace packaged_call_runtime

