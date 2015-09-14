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

#include "visualizers/rgba8_visualizer.h"

#include <map>
#include <string>

#include "float32_to_rgba8_visualizer_chunky.h"
#include "float32_to_rgba8_visualizer_planar.h"
#include "float64_to_rgba8_visualizer_chunky.h"
#include "float64_to_rgba8_visualizer_planar.h"
#include "int16_to_rgba8_visualizer_chunky.h"
#include "int16_to_rgba8_visualizer_planar.h"
#include "int32_to_rgba8_visualizer_chunky.h"
#include "int32_to_rgba8_visualizer_planar.h"
#include "int8_to_rgba8_visualizer_chunky.h"
#include "int8_to_rgba8_visualizer_planar.h"
#include "uint16_to_rgba8_visualizer_chunky.h"
#include "uint16_to_rgba8_visualizer_planar.h"
#include "uint32_to_rgba8_visualizer_chunky.h"
#include "uint32_to_rgba8_visualizer_planar.h"
#include "uint8_to_rgba8_visualizer_chunky.h"
#include "uint8_to_rgba8_visualizer_planar.h"

namespace packaged_call_runtime {
namespace {

typedef int (*VisualizerFunc) (buffer_t* src,
                              buffer_t* dst);

int StubVisualizer(buffer_t* src, buffer_t* dst) {
  // Use this stub to satisfy halide_error arguments
  void* stub = 0;
  halide_error(const_cast<void*>(stub),
               "StubVisualizer should never be called");
  return -1;
}

struct VisualizerFuncs {
  VisualizerFunc planar, chunky;
  VisualizerFuncs() : planar(StubVisualizer), chunky(StubVisualizer) {}
  VisualizerFuncs(VisualizerFunc p, VisualizerFunc c)
      : planar(p), chunky(c) {}
};

// This file may not yet rely on C++11, so we'll build the static map
// with a helper function.
std::map<std::string, VisualizerFuncs> BuildMap() {
  std::map<std::string, VisualizerFuncs> m;
  m["float32"] = VisualizerFuncs(float32_to_rgba8_visualizer_planar,
                                 float32_to_rgba8_visualizer_chunky);
  m["float64"] = VisualizerFuncs(float64_to_rgba8_visualizer_planar,
                                 float64_to_rgba8_visualizer_chunky);
  m["int8"] = VisualizerFuncs(int8_to_rgba8_visualizer_planar,
                              int8_to_rgba8_visualizer_chunky);
  m["int16"] = VisualizerFuncs(int16_to_rgba8_visualizer_planar,
                               int16_to_rgba8_visualizer_chunky);
  m["int32"] = VisualizerFuncs(int32_to_rgba8_visualizer_planar,
                               int32_to_rgba8_visualizer_chunky);
  m["uint8"] = VisualizerFuncs(uint8_to_rgba8_visualizer_planar,
                               uint8_to_rgba8_visualizer_chunky);
  m["uint16"] = VisualizerFuncs(uint16_to_rgba8_visualizer_planar,
                                uint16_to_rgba8_visualizer_chunky);
  m["uint32"] = VisualizerFuncs(uint32_to_rgba8_visualizer_planar,
                                uint32_to_rgba8_visualizer_chunky);
  return m;
}

}  // namespace

int RGBA8Visualizer(void* user_context,
                    const char* type,
                    buffer_t* src,
                    buffer_t* dst) {
  static std::map<std::string, VisualizerFuncs> m = BuildMap();
  std::map<std::string, VisualizerFuncs>::const_iterator it = m.find(type);
  if (it == m.end()) {
    halide_error(const_cast<void*>(user_context), "Unknown buffer type");
    return -1;
  }
  buffer_t src_fixed = *src;
  for (int i = 0; i < 4; ++i) {
    if (src_fixed.extent[i] == 0) src_fixed.extent[i] = 1;
    if (src_fixed.stride[i] == 0) src_fixed.stride[i] = 1;
  }
  bool chunky = (src->stride[2] == 1);
  return chunky
      ? it->second.chunky(&src_fixed, dst)
      : it->second.planar(&src_fixed, dst);
}

}  // namespace packaged_call_runtime

