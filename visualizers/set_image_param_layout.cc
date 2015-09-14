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

#include "visualizers/set_image_param_layout.h"

namespace photos_editing_halide {

const std::map<std::string, ImageParamLayout>&
    get_image_param_layout_enum_map() {
  static const std::map<std::string, ImageParamLayout>
    image_param_layout_enum_map{
        {"planar", ImageParamLayout::Planar},
        {"chunky", ImageParamLayout::Chunky}
    };
  return image_param_layout_enum_map;
}

void set_image_param_layout(Halide::OutputImageParam param,
                            ImageParamLayout layout,
                            Halide::Expr channels) {
    switch (layout) {
        case ImageParamLayout::Planar:
            param.set_stride(0, 1)
                 .set_stride(1, Halide::Expr())
                 .set_stride(2, Halide::Expr());
            break;
        case ImageParamLayout::Chunky:
            param.set_stride(0, channels)
                 .set_stride(1, Halide::Expr())
                 .set_stride(2, 1);
            break;
    }
    param.set_bounds(2, 0, channels);
}

}  // namespace photos_editing_halide
