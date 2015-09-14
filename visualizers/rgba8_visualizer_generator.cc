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
#include "Halide.h"

using photos_editing_halide::ImageParamLayout;
using photos_editing_halide::get_image_param_layout_enum_map;
using photos_editing_halide::set_image_param_layout;
using photos_editing_halide::unnormalize;
using Halide::_;

namespace {

// A "visualizer" is a filter that Safelight uses to display
// an arbitrary buffer_t in a form useful for the Safelight GUI.
// RGBA8Visualizer is a very simple filter that is usually used as the
// default in Safelight; it attempts to convert all incoming formats
// into 8-bit RGBA. Rather than attempting heroic measures to represent
// arbitrary formats in RGBA8, it truncates most formats in a naive way,
// flagging the cases that are lossy. Conversion rules are as follows:
//
// -- Unsigned types should be mapped from 0..MAX -> 0..0xFF
// -- Signed types should be mapped from 0..MAX -> 0..0xFF
//     (Negative values represented as zero)
// -- Float types should be mapped from 0.0..1.0 -> 0..0xFF
//     (out of range values clipped to 0 or 1)
// -- If the input has extent[2] == 1, the single channel will be replicated
//     into R, G, B, with A set to 0xFF (i.e.: represent as grayscale)
// -- If the input has fewer than 3 dimensions with extent > 1,
//     remaining data in the RGBA8 space is filled with 0xFF.
// -- If the input has more than 3 dimensions with extent > 1,
//     the excess data is simply ignored.
//
// Since a Halide pipeline can't have input ImageParams that are variable
// at runtime, we use GeneratorParams to specialize for all known
// formats, generating a separate filter for each; a separate wrapper
// of plain C++ code is used to route to the proper specialization.
//
// Note that we always assume a 4-dimensional input buffer; the caller
// should fill excess dimensions to extent=1.
class RGBA8Visualizer : public Halide::Generator<RGBA8Visualizer> {
 public:
  GeneratorParam<bool> vectorize_{"vectorize", true};
  GeneratorParam<bool> parallelize_{"parallelize", true};
  GeneratorParam<Halide::Type> input_type_{"input_type", Halide::UInt(8)};
  GeneratorParam<ImageParamLayout> layout_{"layout",
      ImageParamLayout::Planar, get_image_param_layout_enum_map()};
  // "UInt(8)" is placeholder: we replace with input_type_
  ImageParam input_{Halide::UInt(8), 4, "input"};

  Func build() {
    input_ = ImageParam{input_type_, 4, "input"};

    Var x("x"), y("y"), c("c");

    const Expr kFF = cast<uint8_t>(0xFF);

    // GeneratorParam<> overloads don't allow accessing members easily.
    // Pull into local var as workaround.
    const Halide::Type type = input_type_;

    Func converted("converted");
    switch (type.code) {
      case Halide::Type::UInt:
        converted(_) = cast<uint8_t>(
            input_(_) >> (type.bits - 8));
        break;
      case Halide::Type::Int:
        converted(_) = unnormalize<uint8_t>(
            max(0, input_(_)) / cast<float>(type.max()));
        break;
      case Halide::Type::Float:
        converted(_) = unnormalize<uint8_t>(
            clamp(input_(_), 0.f, 1.f));
        break;
      case Halide::Type::Handle:
        converted(_) = kFF;
        break;
    }

    Expr ch = input_.extent(2);

    Func output("output");
    output(x, y, c) =
        select(ch == 1,
               select(c < 3, converted(x, y, 0, 0), kFF),
               select(c < ch, converted(x, y, min(c, ch-1), 0), kFF));

    if (vectorize_) {
      // (Note that 'converted' doesn't know about Var "x" since we
      // used Halide::_)
      const int kYDirectVectorSize = natural_vector_size(input_type_);
      converted
        .specialize(input_.width() >= kYDirectVectorSize)
        .vectorize(Halide::_0, kYDirectVectorSize);
    }

    if (parallelize_) {
      Var yi("yi");
      output
          .split(y, y, yi, min(input_.height(), 8))
          .parallel(y);
    }

    output.bound(c, 0, 4);

    // Don't call set_image_param_layout() here; it enforces more constraints
    // than we want for this filter, which needs to be very forgiving.
    switch (layout_) {
        case ImageParamLayout::Planar:
            input_.set_stride(0, 1)
                  .set_stride(1, Expr())
                  .set_stride(2, Expr());
            break;
        case ImageParamLayout::Chunky:
            input_.set_stride(0, Expr())
                  .set_stride(1, Expr())
                  .set_stride(2, 1);
            break;
    }

    // Output is always Chunky RGBA8
    set_image_param_layout(output.output_buffer(),
                           photos_editing_halide::ImageParamLayout::Chunky,
                           4);

    return output;
  }
};

Halide::RegisterGenerator<RGBA8Visualizer>
    register_rgba8_visualizer{"rgba8_visualizer"};

}  // namespace
