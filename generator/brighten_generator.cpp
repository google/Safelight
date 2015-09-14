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

using namespace Halide;

namespace {

class Brighten : public Halide::Generator<Brighten> {
 public:
  GeneratorParam<Halide::Type> input_type_{"input_type", Halide::UInt(8)};
  ImageParam input_{UInt(8), 3, "input"};
  Param<float> brightness_level{ "brightness_level", 1.5, 1.0f, 10.0f };

  Func build() {
    input_ = ImageParam{input_type_, 3, "input"};
    Var x("x"), y("y"), c("c");

    // Make the image brighter.
    Func brighter;
    Expr value = input_(x, y, c);
    value = cast<float>(value);
    value = value * brightness_level;
    value = min(value, 255.0f);
    value = cast<uint8_t>(value);
    brighter(x, y, c) = value;

    // print_when returns the second argument. When the first argument is true,
    // it prints all the other arguments as a side-effect. You normally would
    // never leave a print_when in checked-in code (it's used for debugging and
    // has a tremendous performance impact), it's deliberately left in here
    // as a usage example.
    Func output("output");
    output(x, y, c) = print_when(x == 0 && y == 0 && c ==0, brighter(x, y, c),
    "Brightening picture by a factor of", brightness_level);
    output.vectorize(x, 4);

    return output;
  }
};

Halide::RegisterGenerator<Brighten> register_my_gen{"brighten"};

}  // namespace
