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


#!/bin/bash
# Exports environment variables and a few utility functions needed to build the Safelight server.

# Check for environment variables
: ${NACL_PEPPER_DIR:?"Need to explictly set NACL_PEPPER_DIR.  If you haven't already downloaded it,
    please do here --> https://developer.chrome.com/native-client/sdk/download"}
: ${SAFELIGHT_DIR:?"Need to explicitly set SAFELIGHT_DIR."}
: ${HALIDE_DIR:?"Need to explicitly set HALIDE_DIR.  If you haven't already downloaded it,
    please do here --> https://github.com/halide/Halide/releases"}

# Check if we support that OS. Also needed to set NACL_TOOLCHAIN_BIN
unamea="`uname -a`"
os=""
if [[ $unamea == *"Linux"* ]]
then
  os="linux"
elif [[ $unamea == *"Darwin"* ]]
then
  os="mac"
else
  echo "Safelight currently only supports Linux and Mac OS systems."
  exit
fi

export NACL_TOOLCHAIN_BIN="${NACL_PEPPER_DIR}/toolchain/${os}_pnacl/bin/"
export NACL_PEPPER_INCLUDE="${NACL_PEPPER_DIR}/include/"
export SAFELIGHT_TMP="${SAFELIGHT_DIR}/bin/"
export COMPILE_FLAGS="-Wall -Werror -Wno-unused-function -Wcast-qual -fno-rtti"
export SAFELIGHT_PREBUILTDIR="${SAFELIGHT_TMP}/safelightPrebuiltNexeDir"
export NEXE_RELEASE_DIR="${NACL_PEPPER_DIR}/lib/clang-newlib"
export NEXE_LINKING_FLAGS="-Lhalide/bin -lppapi -lppapi_cpp"
export SAFELIGHT_OUTPUT="${SAFELIGHT_TMP}/output/"
export GOPATH="${SAFELIGHT_DIR}/server/"

COPY_TYPES=(uint8 uint16 float32)
INPUT_TYPES=(float32 float64 int8 int16 int32 uint8 uint16 uint32)
LAYOUTS=(chunky planar)

# Helper function that executes a build command and moves the object file to a tmp directory
# $1 - NaCl Toolchain compile command with flags and source file path
# $2 - Object file to move
# $3 - Optional Argument for an inner folder within $SAFELIGHT_TMP
build_and_move_object_file() {
  echo "Building $2..."
  echo "$1"
  $1
  mkdir -p $SAFELIGHT_TMP/$3
  mv $2 $SAFELIGHT_TMP/$3
}

# Builds copy_image_%s_filters, for each type (uint8, uint16, float32)
# Target: libcopy_image.a
# $1 "nacl" if we are building for nacl
# $2 "tests/deps" if we are testing in order to separate testing dependencies from server dependencies
build_copy_image_filters() {
  target=""
  archiveCommand=""
  if [[ $1 == *"nacl"* ]]
  then
    target="x86-64-nacl"
    archiveCommand="${NACL_TOOLCHAIN_BIN}x86_64-nacl-ar"
  else
    target="x86-64"
    archiveCommand="ar"
  fi
    for i in ${COPY_TYPES[@]}; do
    ${SAFELIGHT_DIR}/server/bin/filterFactory copy_image_${i}_filter ${SAFELIGHT_DIR}/visualizers/copy_image_generator.cc \
      input_elem_type=${i} target=${target}
    ${archiveCommand} rs $SAFELIGHT_TMP/$2/libcopy_image.a $SAFELIGHT_TMP/filters/copy_image_${i}_filter.o
    rm -rf $SAFELIGHT_TMP/filters/copy_image_${i}_filter.o
  done
}

# Build [input_type]_to_rgba8_visualizer_[layout] filters
# Target: librgba8_visualizer.a
# $1 Target architecture with dashes
# $2 Toolchain archive command
build_rgba_visualizer_filters() {
  target=""
  if [[ $2 == *"nacl"* ]]
  then
    target="$1-nacl"
  else
    target="$1"
  fi
  for i in ${INPUT_TYPES[@]}; do
    for j in ${LAYOUTS[@]}; do
      ${SAFELIGHT_DIR}/server/bin/filterFactory ${i}_to_rgba8_visualizer_${j} ${SAFELIGHT_DIR}/visualizers/rgba8_visualizer_generator.cc \
        link_to_gen=$SAFELIGHT_TMP/set_image_param_layout.o input_type=${i} layout=${j} target=${target}
      $2 rs $SAFELIGHT_TMP/librgba8_visualizer.a $SAFELIGHT_TMP/filters/${i}_to_rgba8_visualizer_${j}.o
      rm -rf $SAFELIGHT_TMP/filters/${i}_to_rgba8_visualizer_${j}.o
    done
  done
}

# Build transmogrify_rgba8_to_[input_type] filters
# Target: libtransmogrify_rgba8.a
# $1 - Target architecture with dashes
# $2 - Toolchain archive command
build_transmogrify_rgba8_filters() {
  target=""
  if [[ $2 == *"nacl"* ]]
  then
    target="$1-nacl"
  else
    target="$1"
  fi
  for i in ${INPUT_TYPES[@]}; do
    ${SAFELIGHT_DIR}/server/bin/filterFactory transmogrify_rgba8_to_${i} ${SAFELIGHT_DIR}/visualizers/transmogrify_rgba8_generator.cc \
      link_to_gen=$SAFELIGHT_TMP/set_image_param_layout.o output_type=${i} target=${target}
    $2 rs $SAFELIGHT_TMP/libtransmogrify_rgba8.a $SAFELIGHT_TMP/filters/transmogrify_rgba8_to_${i}.o
    rm -rf $SAFELIGHT_TMP/filters/transmogrify_rgba8_to_${i}.o
  done
}

# Builds the necessary object files and filters needed for visualizer_shell.nexe
# Targets: set_image_param_layout.o, buffer_utils_pepper.o, nexe_verb_handler.o, librgba8_visualizer.a, libtransmogrify_rgba8.a,
# rgba8_visualizer.o, transmogrify_rgba8.o.
# $1 - Toolchain compile command with flags
# $2 - Target architecture (with dashes)
# $3 - Toolchain archive command
# $4 - If testing, pass in "test/deps" to separate testing dependencies from server dependencies.
build_vs_dependencies() {
  mkdir -p $SAFELIGHT_TMP

  # We always build set_image_param_layout.o with g++, since it is a dependency of a Halide Generator rather than a NaCl module.
  compile="g++"
  compileFlags="${COMPILE_FLAGS} -std=c++11"
  includes="-I${NACL_PEPPER_INCLUDE} -I${SAFELIGHT_DIR} -I${HALIDE_DIR}/include"
  compileSetImageParamLayout="g++ -c ${compileFlags} ${includes} ${SAFELIGHT_DIR}/visualizers/set_image_param_layout.cc"
  build_and_move_object_file "${compileSetImageParamLayout}" "set_image_param_layout.o" "$4"

  build_and_move_object_file "$1 ${SAFELIGHT_DIR}/visualizers/buffer_utils_pepper.cc" "buffer_utils_pepper.o" "$4"
  build_and_move_object_file "$1 ${SAFELIGHT_DIR}/visualizers/nexe_verb_handler.cc" "nexe_verb_handler.o" "$4"
  build_rgba_visualizer_filters "$2" "$3"
  build_transmogrify_rgba8_filters "$2" "$3"
  build_and_move_object_file "$1 -std=gnu++11 -I$SAFELIGHT_TMP/filters ${SAFELIGHT_DIR}/visualizers/rgba8_visualizer.cc" "rgba8_visualizer.o" "$4"
  build_and_move_object_file "$1 -std=gnu++11 -I$SAFELIGHT_TMP/filters ${SAFELIGHT_DIR}/visualizers/transmogrify_rgba8.cc" "transmogrify_rgba8.o" "$4"
}

