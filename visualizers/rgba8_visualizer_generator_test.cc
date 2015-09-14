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
#include "visualizers/rgba8_visualizer.h"
#include "googletest/include/gtest/gtest.h"

using packaged_call_runtime::RGBA8Visualizer;
using std::vector;
using Halide::Tools::Image;

namespace {

struct ExtentSet {
  int extents[4];
};

template<typename T>
void MakeSrcBuf(const ExtentSet& e,
                const int dim,
                buffer_t* src,
                vector<uint8_t>* src_stg) {
  size_t storage_needed = sizeof(T);
  *src = buffer_t();
  src->elem_size = sizeof(T);
  for (int i = 0; i < dim; ++i) {
    src->extent[i] = e.extents[i];
    src->stride[i] = (i > 0) ? (src->stride[i - 1] * src->extent[i - 1]) : 1;
    storage_needed *= src->extent[i];
  }
  src_stg->resize(storage_needed);
  src->host = &(*src_stg)[0];
  src->dev = 0;
}

template<typename T>
T ValueAt(int x, int y, int c, int w) {
  // Shift up so that all integral types have bits in the high byte
  // (otherwise expected values will be all zero, which isn't a very
  // interesting test)
  return static_cast<T>((x + y + c + w) << (sizeof(T) * 8 - 8));
}

template<>
float ValueAt<float>(int x, int y, int c, int w) {
  return x * 0.01f + y * 0.02f + c * 0.03f + w * 1.f;
}

template<>
double ValueAt<double>(int x, int y, int c, int w) {
  return x * 0.01 + y * 0.02 + c * 0.03 + w * 1.;
}

template<typename T>
uint8_t ToExpected(T value) {
  GTEST_CHECK_(0) << "Should never be called";
  return 0;
}

template<>
uint8_t ToExpected<uint8_t>(uint8_t value) {
  return value;
}

template<>
uint8_t ToExpected<uint16_t>(uint16_t value) {
  return static_cast<uint8_t>(value >> 8);
}

template<>
uint8_t ToExpected<uint32_t>(uint32_t value) {
  return static_cast<uint8_t>(value >> 24);
}

template<>
uint8_t ToExpected<int8_t>(int8_t value) {
  float f =  std::max(static_cast<int8_t>(0), value) /
      static_cast<float>(std::numeric_limits<int8_t>::max());
  return static_cast<uint8_t>(f * 255.f + 0.5f);
}

template<>
uint8_t ToExpected<int16_t>(int16_t value) {
  float f =  std::max(static_cast<int16_t>(0), value) /
      static_cast<float>(std::numeric_limits<int16_t>::max());
  return static_cast<uint8_t>(f * 255.f + 0.5f);
}

template<>
uint8_t ToExpected<int32_t>(int32_t value) {
  float f =  std::max(static_cast<int32_t>(0), value) /
      static_cast<float>(std::numeric_limits<int32_t>::max());
  return static_cast<uint8_t>(f * 255.f + 0.5f);
}

template<>
uint8_t ToExpected<float>(float value) {
  float f = std::min(std::max(value, 0.f), 1.f);
  return static_cast<uint8_t>(f * 255.f + 0.5f);
}

template<>
uint8_t ToExpected<double>(double value) {
  double f = std::min(std::max(value, 0.), 1.);
  return static_cast<uint8_t>(f * 255. + 0.5);
}

template <typename T>
void FillSrcBuf(int dim, buffer_t* buf) {
  GTEST_CHECK_(buf->elem_size == sizeof(T));
  const int xm = std::max(1, buf->extent[0]);
  const int ym = std::max(1, buf->extent[1]);
  const int cm = std::max(1, buf->extent[2]);
  const int wm = std::max(1, buf->extent[3]);
  for (int x = 0; x < xm; ++x) {
    for (int y = 0; y < ym; ++y) {
      for (int c = 0; c < cm; ++c) {
        for (int w = 0; w < wm; ++w) {
          T* p = reinterpret_cast<T*>(buf->host) +
              x * buf->stride[0] +
              y * buf->stride[1] +
              c * buf->stride[2] +
              w * buf->stride[3];
          *p = ValueAt<T>(x, y, c, w);
        }
      }
    }
  }
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
void RunTest() {

  buffer_t src;
  vector<uint8_t> src_stg;

  Image<uint8_t> dst;

  const ExtentSet src_extents[] = {
    { { 16, 8, 8, 2 } },
    { { 16, 8, 4, 2 } },
    { { 16, 8, 3, 2 } },
    { { 16, 8, 1, 2 } },
    { { 1, 1, 1, 1 } }
  };
  for (int e = 0; e < sizeof(src_extents)/sizeof(src_extents[0]); ++e) {
    for (int dim = 0; dim <= 4; ++dim) {
      MakeSrcBuf<T>(src_extents[e], dim, &src, &src_stg);
      FillSrcBuf<T>(dim, &src);
      dst = Image<uint8_t>(std::max(1, src.extent[0]), std::max(1, src.extent[1]), 4, 0,true);
      EXPECT_EQ(0, RGBA8Visualizer(nullptr, TypeToStr<T>(),
                                   &src, dst))
          << "Failure at "
          << "dim = " << dim
          << ", src_extents = "
          << src_extents[e].extents[0] << " "
          << src_extents[e].extents[1] << " "
          << src_extents[e].extents[2] << " "
          << src_extents[e].extents[3];
      buffer_t dstBuf = *dst;
      for (int x = 0; x < dstBuf.extent[0]; ++x) {
        for (int y = 0; y < dstBuf.extent[1]; ++y) {
          for (int c = 0; c < dstBuf.extent[2]; ++c) {
            const uint8_t* actual =
                dstBuf.host +
                x * dstBuf.stride[0] +
                y * dstBuf.stride[1] +
                c * dstBuf.stride[2];
            uint8_t expected;
            if (dim < 3 || src_extents[e].extents[2] == 1) {
              expected = c < 3 ?
                  ToExpected<T>(ValueAt<T>(x, y, 0, 0)) :
                  0xFF;
            } else {
              expected = c < src_extents[e].extents[2] ?
                  ToExpected<T>(ValueAt<T>(x, y, c, 0)) :
                  0xFF;
            }
            EXPECT_EQ(expected, *actual) <<
                "Mismatch at " << x << " " << y << " " << c
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
TEST(Rgba8VisualizerGeneratorTest, UInt8) {
  RunTest<uint8_t>();
}

TEST(Rgba8VisualizerGeneratorTest, UInt16) {
  RunTest<uint16_t>();
}

TEST(Rgba8VisualizerGeneratorTest, UInt32) {
  RunTest<uint32_t>();
}

TEST(Rgba8VisualizerGeneratorTest, Int8) {
  RunTest<int8_t>();
}

TEST(Rgba8VisualizerGeneratorTest, Int16) {
  RunTest<int16_t>();
}

TEST(Rgba8VisualizerGeneratorTest, Int32) {
  RunTest<int32_t>();
}

TEST(Rgba8VisualizerGeneratorTest, Float32) {
  RunTest<float>();
}

TEST(Rgba8VisualizerGeneratorTest, Float64) {
  RunTest<double>();
}
}  // namespace
