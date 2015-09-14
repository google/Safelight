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

#include "Halide.h"

namespace {

namespace BoundaryConditions = Halide::BoundaryConditions;

// A simple filter to copy input image into output image. The input and output
// images must have the same size, but they can have different channel counts.
// * If input has more channels than output, ignore the excess.
// * If output has more channels than input, use opaque for the excess.
class CopyImage : public Halide::Generator<CopyImage> {
 public:
  GeneratorParam<Halide::Type> input_elem_type_{"input_elem_type", UInt(8)};
  // By default, we assume that we won't encounter many images that
  // are narrow-but-tall, or wide-butshort, and don't include explicit
  // specialization for them (so they take the slower general path). If you
  // need such code, you can use specialize_narrow_wide=true to include
  // extra specializations, at the cost of extra code size.
  GeneratorParam<bool> specialize_narrow_wide_{"specialize_narrow_wide", false};

  // UInt(8) is a placeholder: we replace it with input_type
  ImageParam input_{UInt(8), 4, "copy_input"};

  Func build() {
    input_ = ImageParam{input_elem_type_, 4, "copy_input"};

    // If output has more channels than input, use opaque for the excess
    Expr opaque = select(input_.type().code == Halide::Type::Float,
                         cast(input_.type(), 1.0f),
                         cast(input_.type(), input_.type().max()));

    Var x("x"), y("y"), c("c"), w("w");

    Func output("copy_output");
    output(x, y, c, w) =
        BoundaryConditions::constant_exterior(input_, opaque)(x, y, c, w);

    const int kYDirectVectorSize = natural_vector_size(input_elem_type_);
    Expr vectorize = input_.width() >= kYDirectVectorSize &&
                     output.output_buffer().width() >= kYDirectVectorSize;

    // Somewhat arbitrary; benchmarking on x86-64 12-core systems showed
    // this to a reasonable sweet spot.
    const int kSplitSize = 4;
    Expr parallelize = input_.height() > kSplitSize &&
                       output.output_buffer().height() > kSplitSize;

    Var yi("yi");

    Expr input_planar = input_.stride(0) == 1;
    Expr input_chunky = input_.stride(2) == 1;
    Expr output_planar = output.output_buffer().stride(0) == 1;
    Expr output_chunky = output.output_buffer().stride(2) == 1;

    // Order matters: we try each specialization in order.
    Expr stride_specializations[] = {
      input_planar && output_planar,
      input_planar,
      output_planar,
      input_chunky && output_chunky
      // There aren't specializations for input-chunky or output-chunky,
      // because in practice, those are already handled by input-planar
      // or output-planar.
    };
    const int kNumStrideSpecializations = sizeof(stride_specializations) /
        sizeof(stride_specializations[0]);

    for (int i = 0; i < kNumStrideSpecializations; ++i) {
      output
          .specialize(vectorize && parallelize && stride_specializations[i])
          .vectorize(x, kYDirectVectorSize)
          .split(y, y, yi, kSplitSize)
          .parallel(y);
    }

    if (specialize_narrow_wide_) {
      for (int i = 0; i < kNumStrideSpecializations; ++i) {
        // For images >= kYDirectVectorSize in w but < kSplitSize in h.
        output
            .specialize(vectorize && stride_specializations[i])
            .vectorize(x, kYDirectVectorSize);
        // For images < kYDirectVectorSize in w but > kSplitSize in h.
        output
            .specialize(parallelize)
            .split(y, y, yi, kSplitSize)
            .parallel(y);
      }
    }

    input_.set_stride(0, Expr());
    output.output_buffer().set_stride(0, Expr());

    return output;
  }
};

Halide::RegisterGenerator<CopyImage> register_copy_image{"copy_image"};

}  // namespace
