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

class PackagedCallTester : public Halide::Generator<PackagedCallTester> {
 public:
  ImageParam input1{UInt(8), 3, "input1"};
  ImageParam input2{UInt(8), 3, "input2"};
  Param<float> f{"f", 1.0f, 0.0f, 10.0f};
  Param<double> d{"d", 1.0f, 0.0f, 10.0f};
  Param<bool> b{"b", true};
  Param<uint8_t> u8{"u8", 8, 0, 255};
  Param<uint16_t> u16{"u16", 16, 0, 255};
  Param<uint32_t> u32{"u32", 32, 0, 255};
  Param<uint64_t> u64{"u64", 64, 0, 255};
  Param<int8_t> i8{"i8", 8, 0, 127};
  Param<int16_t> i16{"i16", 16, 0, 255};
  Param<int32_t> i32{"i32", 32, 0, 255};
  Param<int64_t> i64{"i64", 64, 0, 255};

  Func build() {
    Var x("x"), y("y"), c("c");

    Func in1("in1"), in2("in2");
    in1(x, y, c) = BoundaryConditions::repeat_edge(input1)(x, y, c);
    in2(x, y, c) = BoundaryConditions::repeat_edge(input2)(x, y, c);

    Func o1("o1"), o2("o2"), o3("o3");
    o1(x, y, c) = cast<uint8_t>(in1(x, y, c) + in2(x, y, c) + 0);
    o2(x, y, c) = cast<uint8_t>(in1(x, y, c) + in2(x, y, c) + 63);
    o3(x, y, c) = cast<uint8_t>(in1(x, y, c) + in2(x, y, c) + 127);

    Func f("f");
    f(x, y, c) = Tuple(o1(x, y, c), o2(x, y, c), o3(x, y, c));

    return f;
  }
};

Halide::RegisterGenerator<PackagedCallTester>
    register_me{"packaged_call_tester"};

}  // namespace
