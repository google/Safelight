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

#ifndef PHOTOS_EDITING_HALIDE_INCLUDE_HALIDE_UTILS_H_
#define PHOTOS_EDITING_HALIDE_INCLUDE_HALIDE_UTILS_H_

#include <stdint.h>

#include <cassert>
#include <limits>
#include <map>

#include "Halide.h"

namespace photos_editing_halide {

// Routines to convert between a normalized [0.0, 1.0] float representation
// and an integer [0, 2^n-1] representation where n is the integer pixel
// width in bits.

// Note that this explicitly does not handle signed types (and checks for
// unsignedness of integral types at compile time).

template <typename pixel_t>
inline Halide::Expr normalize(Halide::Expr val) {
  static_assert((std::numeric_limits<pixel_t>::is_integer &&
                 std::numeric_limits<pixel_t>::is_signed) == false,
                "integral pixel_t types must be unsigned");
  return val / static_cast<float>(std::numeric_limits<pixel_t>::max());
}

template <>
inline Halide::Expr normalize<float>(Halide::Expr val) {
  return val;
}

template <typename pixel_t>
inline Halide::Expr unnormalize(Halide::Expr val) {
  static_assert((std::numeric_limits<pixel_t>::is_integer &&
                 std::numeric_limits<pixel_t>::is_signed) == false,
                "integral pixel_t types must be unsigned");
  return Halide::cast<pixel_t>(val * std::numeric_limits<pixel_t>::max() + .5f);
}

template <>
inline Halide::Expr unnormalize<float>(Halide::Expr val) {
  return val;
}

/* ImageParamLayout is a convenient shorthand for representing
 * common buffer layouts for input and output ImageParams. It is
 * not meant to be exhaustive, merely to make common Generator patterns
 * more convenient (in particular, specialization of a pipeline for
 * a Planar vs Chunky layout based on a GeneratorParam value).  */
enum class ImageParamLayout {
  // Traditional Planar layout; rows and planes may or may not have padding.
  Planar,
  // Traditional interleaved (e.g. RGBRGBRGB, RGBARGBARGBA, etc).
  // There may or may not be padding at the end of each row.
  Chunky
};

extern const std::map<std::string, ImageParamLayout>&
    get_image_param_layout_enum_map();

/* Set the stride and bounds appropriately for an image
 * with the given layout and channel count. Note that this
 * call assumes the convention of dimensions 0,1,2 being
 * x,y,c respectively. Note also that there is (deliberately)
 * no equivalent get_layout() call; since ImageParamLayout is not
 * intended to be comprehensive, there can easily be ImageParams
 * that don't conform to any of the predefined ImageParamLayout values. */
void set_image_param_layout(Halide::OutputImageParam param,
                            ImageParamLayout layout,
                            Halide::Expr channels);


}  // namespace photos_editing_halide

#endif  // PHOTOS_EDITING_HALIDE_INCLUDE_HALIDE_UTILS_H_
