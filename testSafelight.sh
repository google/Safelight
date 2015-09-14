#!/bin/bash
# Copyright 2015 Google Inc. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS-IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


# Script for testing individual Safelight dependencies.

set -e

source ${SAFELIGHT_DIR}/exportEnv.sh

cppFlags="-isystem ${GTEST_DIR}/googletest/include"
cxxFlags="-g -Wall -Wextra -pthread"

# Builds filterFactory, a go module used to build Halide Generators and filters.
build_filterFactory() {
  go get github.com/golang/groupcache/lru
  go install filterFactory
}

# Builds packaged_call_tester filter.
build_packaged_call_tester_generator() {
  ${SAFELIGHT_DIR}/server/bin/filterFactory packaged_call_tester ${SAFELIGHT_DIR}/visualizers/packaged_call_tester_generator.cc \
    target=x86-64-user_context
}

# Builds gTest (copies Make instructions from googletest/make)
build_gtest() {
  echo "Building gtest..."
  compileGTestAll="g++ ${cppFlags} -I${GTEST_DIR}/googletest ${cxxFlags} -c ${GTEST_DIR}/googletest/src/gtest-all.cc"
  compileGTestMain="g++ ${cppFlags} -I${GTEST_DIR}/googletest ${cxxFlags} -c ${GTEST_DIR}/googletest/src/gtest_main.cc"

  #TODO(lglucin): Make a simple verbose flag thoughout to ease debugging.  Maybe a wrapper function.
  if [ "$1" == "-v" ]
  then
    echo ${compileGTestAll}
    echo ${compileGTestMain}
  fi

  ${compileGTestAll}
  ${compileGTestMain}
  ar rs gtest.a gtest-all.o
  ar rs gtest_main.a gtest-all.o gtest_main.o
  mkdir -p ${SAFELIGHT_TMP}
  rm gtest-all.o
  rm gtest_main.o
  mv gtest.a ${SAFELIGHT_TMP}
  mv gtest_main.a ${SAFELIGHT_TMP}
}

# Builds and runs pacakge_call_runtime tests.
test_packaged_call_runtime() {
  echo ">>>>>>>>>> PACKAGE CALL RUNTIME TESTING"

  cd ${JSONCPP_DIR}
  python amalgamate.py
  compile="g++"
  includes="-I${JSONCPP_DIR}/src/lib_json -I${JSONCPP_DIR}/dist"
  build_and_move_object_file "${compile} -c ${includes} ${JSONCPP_DIR}/dist/jsoncpp.cpp" "jsoncpp.o" "tests/deps"

  build_packaged_call_tester_generator
  build_copy_image_filters "" "tests/deps"

  compileFlags="-c -std=c++11"
  includes="-I${SAFELIGHT_DIR} -I${SAFELIGHT_TMP}/filters -I${HALIDE_DIR}/include"
  build_and_move_object_file "${compile} ${compileFlags} ${includes} ${SAFELIGHT_DIR}/visualizers/packaged_call_runtime.cc" "packaged_call_runtime.o" "tests/deps"

  compileFlags="${cppFlags} ${cxxFlags} -std=c++11"
  includes="-I${SAFELIGHT_TMP}/filters -I${JSONCPP_DIR}/dist -I${HALIDE_DIR}/include -I${GTEST_DIR} -I${GTEST_DIR}/googletest/include -I${SAFELIGHT_DIR}"
  deps="${SAFELIGHT_TMP}/tests/deps/packaged_call_runtime.o ${SAFELIGHT_TMP}/tests/deps/jsoncpp.o ${SAFELIGHT_TMP}/filters/packaged_call_tester.o"
  linkFlags="-L${SAFELIGHT_TMP}/tests/deps ${SAFELIGHT_TMP}/gtest.a ${SAFELIGHT_TMP}/gtest_main.a -lcopy_image -ldl -lpthread"
  compilePackagedCallTest="g++ ${compileFlags} ${SAFELIGHT_DIR}/visualizers/packaged_call_test.cc ${includes} ${deps} ${linkFlags} -o packaged_call_test"
  echo "Building packaged_call_test executable..."
  ${compilePackagedCallTest}

  mkdir -p ${SAFELIGHT_TMP}/tests
  mv packaged_call_test ${SAFELIGHT_TMP}/tests
  echo "Running packaged_call_test..."
  ${SAFELIGHT_TMP}/tests/packaged_call_test
}

# Builds and runs a visualizer test.
# $1 test name ("rgba8_visualizer_generator_test" or "transmogrify_rgba8_test")
visualizer_test() {
  dep=""
  if [ "$1" == "rgba8_visualizer_generator_test" ]
  then
    echo ">>>>>>>>>> RGBA8 VISUALIZER TESTING"
    dep="rgba8_visualizer"
  else
    echo ">>>>>>>>>> TRANSMOGRIFY TESTING"
    dep="transmogrify_rgba8"
  fi

  compile="g++"
  compileFlags="${cppFlags} -std=c++11 -g"
  includes="-I${GTEST_DIR} -I${SAFELIGHT_DIR} -I${HALIDE_DIR}/include -I${HALIDE_DIR}/tools"
  deps="${SAFELIGHT_TMP}/tests/deps/${dep}.o"
  linkFlags="${SAFELIGHT_TMP}/gtest.a ${SAFELIGHT_TMP}/gtest_main.a -L${SAFELIGHT_TMP}  -l${dep} -lpthread -ldl"
  compileTest="${compile} ${compileFlags} ${includes} ${deps} ${linkFlags} ${SAFELIGHT_DIR}/visualizers/$1.cc -o $1"
  ${compileTest}

  mkdir -p ${SAFELIGHT_TMP}/tests
  mv $1 ${SAFELIGHT_TMP}/tests/
  echo "Running $1..."
  ${SAFELIGHT_TMP}/tests/$1
}

build_filterFactory
build_gtest $1
build_vs_dependencies "g++ -c ${COMPILE_FLAGS} -I${SAFELIGHT_DIR} -I${HALIDE_DIR}/include" "x86-64" "ar" "tests/deps" 
test_packaged_call_runtime
visualizer_test "rgba8_visualizer_generator_test"
visualizer_test "transmogrify_rgba8_test"
