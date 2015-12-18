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
using photos_editing_halide::normalize;

namespace {

namespace BoundaryConditions = Halide::BoundaryConditions;

// "Transmogrify" is a utility meant to convert an RGBA8 input
// into an arbitrary format; this is of limited use, but can occasionally
// be useful when testing and experimenting in Safelight.
//
// -- Unsigned types are mapped from 0x00..0xFF -> 0..MAX
// -- Signed types are simply cast from the source uint8_t value.
// -- Unsigned types are mapped from 0x00..0xFF -> 0.0..1.0
//
// -- If the output has < 3 dimensions, excess will simply be ignored.
// -- If the output has >= 3 dimensions, excess will be filled as
// though the source had 0xFF at that location.
//
// Since a Halide pipeline can't have input ImageParams that are variable
// at runtime, we use GeneratorParams to specialize for all known
// formats, generating a separate filter for each; a separate wrapper
// of plain C++ code is used to route to the proper specialization.
//
// Note that we always assume a 4-dimensional output buffer; the caller
// should fill excess dimensions to extent=1.
class TransmogrifyRGBA8 : public Halide::Generator<TransmogrifyRGBA8> {
 public:
  GeneratorParam<bool> vectorize_{"vectorize", true};
  GeneratorParam<bool> parallelize_{"parallelize", true};
  GeneratorParam<Halide::Type> output_type_{"output_type", Halide::UInt(8)};

  ImageParam input_{Halide::UInt(8), 3, "input"};
  Param<int> output_dimensions_{"output_dimensions", 3, 0, 4};

  Func build() {
    Var x("x"), y("y"), c("c"), z("z");

    // Input is always Chunky RGBA8
    set_image_param_layout(input_,
                           photos_editing_halide::ImageParamLayout::Chunky,
                           /* channels */ 4);

    const Expr kFF = cast<uint8_t>(0xFF);
    Func clamped = BoundaryConditions::constant_exterior(input_, kFF);

    // GeneratorParam<> overloads don't allow accessing members easily.
    // Pull into local var as workaround.
    const Halide::Type output_type = output_type_;

    Func converted("converted");
    switch (output_type.code()) {
      case Halide::Type::UInt: {
        const int kMultiplier = (1UL << output_type.bits()) / 0xFF;
        converted(x, y, c) =
            cast(output_type, cast(output_type, clamped(x, y, c)) *
                                  cast(output_type, kMultiplier));
        break;
      }
      case Halide::Type::Int: {
        converted(x, y, c) = cast(output_type, clamped(x, y, c));
        break;
      }
      case Halide::Type::Float: {
        converted(x, y, c) =
            cast(output_type, normalize<uint8_t>(clamped(x, y, c)));
        break;
      }
      default: {
        break;
      }
    }

    Func output("output");
    output(x, y, c, z) =
        select(output_dimensions_ >= 3, converted(x, y, c),
               output_dimensions_ == 2, converted(x, y, 0),
               output_dimensions_ == 1, converted(x, 0, 0),
                                        converted(0, 0, 0));

    if (vectorize_) {
      const int kYDirectVectorSize = natural_vector_size(output_type_);
      converted
        .specialize(output.output_buffer().width() >= kYDirectVectorSize)
        .vectorize(x, kYDirectVectorSize);
    }

    if (parallelize_) {
      const int kSplitSize = 8;
      Var yi("yi");
      output
          .specialize(output.output_buffer().height() > kSplitSize)
          .split(y, y, yi, kSplitSize)
          .parallel(y);
    }

    return output;
  }
};

Halide::RegisterGenerator<TransmogrifyRGBA8> register_transmogrify_rgba8{
    "transmogrify_rgba8"};

}  // namespace
