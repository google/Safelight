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

#ifndef PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_TRANSMOGRIFY_RGBA8_H_
#define PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_TRANSMOGRIFY_RGBA8_H_

#include "HalideRuntime.h"

namespace packaged_call_runtime {

int TransmogrifyRGBA8(void* user_context,
                      const char* type,
                      buffer_t* src,
                      buffer_t* dst);

}  // namespace packaged_call_runtime

#endif  // PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_TRANSMOGRIFY_RGBA8_H_
