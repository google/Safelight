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

#include <algorithm>
#include <limits>
#include <string>
#include <vector>

#include "halide_image.h"
#include "visualizers/transmogrify_rgba8.h"
#include "googletest/include/gtest/gtest.h"

using std::vector;
using Halide::Tools::Image;

namespace {

struct ExtentSet {
  int extents[4];
};

uint8_t SrcValueAt(int x, int y, int c, int w) {
  return static_cast<uint8_t>(x + y + c + w);
}

template<typename T>
T ExpectedValue(uint8_t value) {
  GTEST_CHECK_(0) << "Should never be called";
  return 0;
}

template<>
uint8_t ExpectedValue<uint8_t>(uint8_t value) {
  return value;
}

template<>
uint16_t ExpectedValue<uint16_t>(uint8_t value) {
  return static_cast<uint16_t>(value * 0x101);
}

template<>
uint32_t ExpectedValue<uint32_t>(uint8_t value) {
  return static_cast<uint32_t>(value * 0x1010101);
}

template<>
int8_t ExpectedValue<int8_t>(uint8_t value) {
  return static_cast<int8_t>(value);
}

template<>
int16_t ExpectedValue<int16_t>(uint8_t value) {
  return static_cast<int16_t>(value);
}

template<>
int32_t ExpectedValue<int32_t>(uint8_t value) {
  return static_cast<int32_t>(value);
}

template<>
float ExpectedValue<float>(uint8_t value) {
  return static_cast<float>(value / 255.0f);
}

template<>
double ExpectedValue<double>(uint8_t value) {
  return static_cast<double>(value / 255.0);
}

template<typename T>
const char* TypeToStr() {
  GTEST_CHECK_(0) << "Should never be called";
  return "";
}

template<> const char* TypeToStr<uint8_t>() { return "uint8"; }
template<> const char* TypeToStr<uint16_t>() { return "uint16"; }
template<> const char* TypeToStr<uint32_t>() { return "uint32"; }
template<> const char* TypeToStr<int8_t>() { return "int8"; }
template<> const char* TypeToStr<int16_t>() { return "int16"; }
template<> const char* TypeToStr<int32_t>() { return "int32"; }
template<> const char* TypeToStr<float>() { return "float32"; }
template<> const char* TypeToStr<double>() { return "float64"; }

template<typename T>
void MakeDstBuf(const ExtentSet& e,
                const int dim,
                buffer_t* dst,
                vector<uint8_t>* dst_stg) {
  size_t storage_needed = sizeof(T);
  *dst = buffer_t();
  dst->elem_size = sizeof(T);
  for (int i = 0; i < dim; ++i) {
    dst->extent[i] = e.extents[i];
    dst->stride[i] = (i > 0) ? (dst->stride[i - 1] * dst->extent[i - 1]) : 1;
    storage_needed *= dst->extent[i];
  }
  dst_stg->resize(storage_needed);
  dst->host = &(*dst_stg)[0];
  dst->dev = 0;
}

template<typename T>
void RunTest() {
  Image<uint8_t> src;

  buffer_t dst;
  vector<uint8_t> dst_stg;

  const ExtentSet src_extents[] = {
    { { 16, 8, 8, 2 } },
    { { 16, 8, 4, 2 } },
    { { 16, 8, 3, 2 } },
    { { 16, 8, 1, 2 } },
    { { 1, 1, 1, 1 } },
    { { 1024, 1024, 4, 4 } }
  };

  for (int e = 0; e < sizeof(src_extents)/sizeof(src_extents[0]); ++e) {
    src = Image<uint8_t>(std::max(1, src_extents[e].extents[0]), std::max(1, src_extents[e].extents[1]), 4, 0, true);
    buffer_t srcBuf = *src;
    for (int x = 0; x < srcBuf.extent[0]; ++x) {
      for (int y = 0; y < srcBuf.extent[1]; ++y) {
        for (int c = 0; c < srcBuf.extent[2]; ++c) {
          uint8_t* p =
              srcBuf.host +
              x * srcBuf.stride[0] +
              y * srcBuf.stride[1] +
              c * srcBuf.stride[2];
          *p = SrcValueAt(x, y, c, 0);
        }
      }
    }

    for (int dim = 0; dim <= 4; ++dim) {
      MakeDstBuf<T>(src_extents[e], dim, &dst, &dst_stg);
      EXPECT_EQ(0, packaged_call_runtime::TransmogrifyRGBA8(
          nullptr, TypeToStr<T>(), src, &dst))
          << "Failure at "
          << "dim = " << dim
          << ", src_extents = "
          << src_extents[e].extents[0] << " "
          << src_extents[e].extents[1] << " "
          << src_extents[e].extents[2] << " "
          << src_extents[e].extents[3];

      for (int i = 0; i < 4; ++i) {
        if (i >= dim) {
          EXPECT_EQ(0, dst.extent[i]);
        } else {
          EXPECT_NE(0, dst.extent[i]);
        }
      }

      for (int x = 0; x < std::max(1, dst.extent[0]); ++x) {
        for (int y = 0; y < std::max(1, dst.extent[1]); ++y) {
          for (int c = 0; c < std::max(1, dst.extent[2]); ++c) {
            for (int w = 0; w < std::max(1, dst.extent[3]); ++w) {
              const T* actual = reinterpret_cast<const T*>(
                  dst.host +
                  dst.elem_size * (x * dst.stride[0] +
                                   y * dst.stride[1] +
                                   c * dst.stride[2] +
                                   w * dst.stride[3]));
              T expected =
                  ExpectedValue<T>(c < 4 ? SrcValueAt(x, y, c, 0) : 0xFF);
              // float and double can have trivial differences;
              // do all comparisons in double since EXPECT_NEAR doesn't overload
              // easily.
              const double kErrMax = 1e-6;
              EXPECT_NEAR(expected, *actual, kErrMax)
                  << "Mismatch at " << x << " " << y << " " << c
                  << ", type = " << TypeToStr<T>()
                  << ", dim = " << dim
                  << ", src_extents = "
                  << src_extents[e].extents[0] << " "
                  << src_extents[e].extents[1] << " "
                  << src_extents[e].extents[2] << " "
                  << src_extents[e].extents[3];
            }
          }
        }
      }
    }
  }
}

TEST(TransmogrifyRgba8GeneratorTest, UInt8) {
  RunTest<uint8_t>();
}

TEST(TransmogrifyRgba8GeneratorTest, UInt16) {
  RunTest<uint16_t>();
}

TEST(TransmogrifyRgba8GeneratorTest, UInt32) {
  RunTest<uint32_t>();
}

TEST(TransmogrifyRgba8GeneratorTest, Int8) {
  RunTest<int8_t>();
}

TEST(TransmogrifyRgba8GeneratorTest, Int16) {
  RunTest<int16_t>();
}

TEST(TransmogrifyRgba8GeneratorTest, Int32) {
  RunTest<int32_t>();
}

TEST(TransmogrifyRgba8GeneratorTest, Float32) {
  RunTest<float>();
}

TEST(TransmogrifyRgba8GeneratorTest, Float64) {
  RunTest<double>();
}
}  // namespace
