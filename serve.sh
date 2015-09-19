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
# Script for running Safelight using the ui safelight/ui
# Creates necessary prebuilt files and runs the server.

set -e

source ${SAFELIGHT_DIR}/exportEnv.sh

# Builds nacl_sniffer.nexe given a specific architecture (x86_64, x86_32, or arm)
# Targets: nexe_verb_handler.o, nacl_sniffer.nexe
# $1 Target architecture
build_nacl_sniffer() {
  echo ">>>>>>>>>> Starting $1 build for nacl_sniffer.nexe..."

  compile="$NACL_TOOLCHAIN_BIN$1-nacl-clang++"
  compileFlags="-c ${COMPILE_FLAGS}"
  includes="-I${NACL_PEPPER_INCLUDE} -I${SAFELIGHT_DIR} -I${HALIDE_DIR}/include"
  compileNexeVerbHandler="${compile} ${compileFlags} ${includes} ${SAFELIGHT_DIR}/visualizers/nexe_verb_handler.cc"
  if [ $1 == "x86_32" ]
  then
    compileNexeVerbHandler="${compileNexeVerbHandler/x86_32/x86_64} -m32"
  fi
  build_and_move_object_file "${compileNexeVerbHandler}" nexe_verb_handler.o

  compileFlags="${COMPILE_FLAGS} -std=gnu++11"
  includes="-I${NACL_PEPPER_INCLUDE} -I${SAFELIGHT_DIR}"
  linkFlags="-L${NEXE_RELEASE_DIR}_$1/Release ${NEXE_LINKING_FLAGS}"
  deps="$SAFELIGHT_TMP/nexe_verb_handler.o"

  buildNaclSniffer="${compile} -o nacl_sniffer.nexe ${compileFlags} ${includes} ${deps} \
    ${SAFELIGHT_DIR}/ui/components/nacl_sniffer/nacl_sniffer.cc ${linkFlags}"

  if [ $1 == "x86_32" ]
  then
    buildNaclSniffer="${buildNaclSniffer/x86_32/x86_64} -m32"
  fi
  ${buildNaclSniffer}
  echo "${buildNaclSniffer}"
  mkdir -p ${SAFELIGHT_PREBUILTDIR}/$1
  mv nacl_sniffer.nexe ${SAFELIGHT_PREBUILTDIR}/$1
}

# Builds visualizers_shell.nexe given a specific architecture (x86_64, x86_32, or arm)
# Targets: set_image_param_layout.o, buffer_utils_pepper.o, nexe_verb_handler.o,
# librgba8_visualizer.a, libtransmogrify_rgba8.a, visualizers_shell.nexe.
# $1 - Target architecture
build_visualizer_shell() {
  echo ">>>>>>>>>> Starting $1 build for visualizer_shell.nexe..."

  # Define specific toolchain commands depending on architecture
  target=${1/_/-}
  naclArchive="$NACL_TOOLCHAIN_BIN$1-nacl-ar"
  naclFlags="-c ${COMPILE_FLAGS}"
  naclModuleIncludes="-I${SAFELIGHT_DIR} -I${NACL_PEPPER_INCLUDE} -I${HALIDE_DIR}/include"
  naclBuildPrefix="$NACL_TOOLCHAIN_BIN$1-nacl-clang++ ${naclFlags} ${naclModuleIncludes}"
  if [ $1 == "x86_32" ]
  then
    naclArchive="${naclArchive/x86_32-nacl-ar/pnacl-ar}"
    naclBuildPrefix="${naclBuildPrefix/x86_32/x86_64} -m32"
  elif [ $1 == "arm" ]
  then
    target="arm-32"
  fi

  go get github.com/golang/groupcache/lru
  go install filterFactory
  build_vs_dependencies "${naclBuildPrefix}" "${target}" "${naclArchive}"

  echo "Building visualizers_shell.nexe..."
  compile=${naclBuildPrefix/-c /}
  deps="$SAFELIGHT_TMP/transmogrify_rgba8.o $SAFELIGHT_TMP/buffer_utils_pepper.o $SAFELIGHT_TMP/rgba8_visualizer.o $SAFELIGHT_TMP/nexe_verb_handler.o"
  linkFlags="-L${SAFELIGHT_TMP} -lrgba8_visualizer -ltransmogrify_rgba8 -L${NEXE_RELEASE_DIR}_$1/Release ${NEXE_LINKING_FLAGS}"
  compileVisShell="${compile} ${deps} ${linkFlags} -o visualizers_shell.nexe ${SAFELIGHT_DIR}/visualizers/visualizers_shell.cc"
  ${compileVisShell}
  mkdir -p ${SAFELIGHT_PREBUILTDIR}/$1
  mv visualizers_shell.nexe ${SAFELIGHT_PREBUILTDIR}/$1
}

# Builds nexe_shell object file.
# Targets: nexe_verb_handler.o, nexe_shell.o
build_nexe_shell() {
  compile="${NACL_TOOLCHAIN_BIN}/x86_64-nacl-clang++"
  compileFlags="-c ${COMPILE_FLAGS}"
  includes="-I${NACL_PEPPER_INCLUDE} -I${SAFELIGHT_DIR} -I${HALIDE_DIR}/include"
  compileNexeVerbHandler="${compile} ${compileFlags} ${includes} ${SAFELIGHT_DIR}/visualizers/nexe_verb_handler.cc"
  build_and_move_object_file "${compileNexeVerbHandler}" nexe_verb_handler.o

  compileFlags="${compileFlags} -std=gnu++11"
  build_and_move_object_file "${compile} ${compileFlags} ${includes} ${SAFELIGHT_DIR}/visualizers/nexe_shell.cc" "nexe_shell.o"
}

# Build nacl_sniffer.nexe for x86_32, x86_64, and arm architectures
buildNaclSniffers() {
  if [ ! -f ${SAFELIGHT_PREBUILTDIR}/x86_32/nacl_sniffer.nexe ]; then
    build_nacl_sniffer "x86_32"
  fi
  if [ ! -f ${SAFELIGHT_PREBUILTDIR}/x86_64/nacl_sniffer.nexe ]; then
    build_nacl_sniffer "x86_64"
  fi
  if [ ! -f ${SAFELIGHT_PREBUILTDIR}/arm/nacl_sniffer.nexe ]; then
    build_nacl_sniffer "arm"
  fi
}

# Build visualizer_shell.nexe for x86_32, x86_64, and arm architectures
buildVisualizerShells() {
  if [ ! -f ${SAFELIGHT_PREBUILTDIR}/x86_32/visualizers_shell.nexe ]; then
    build_visualizer_shell "x86_32"
  fi
  if [ ! -f ${SAFELIGHT_PREBUILTDIR}/x86_64/visualizers_shell.nexe ]; then
    build_visualizer_shell "x86_64"
  fi
  if [ ! -f ${SAFELIGHT_PREBUILTDIR}/arm/visualizers_shell.nexe ]; then
    build_visualizer_shell "arm"
  fi
}

# Builds files necessary to build the .nexe's that execute Halide code
# Targets: packaged_call_runtime.o, nexe_shell.o
buildNexeDeps() {
  if [ ! -f ${SAFELIGHT_TMP}/nexe_shell.o ]; then
    build_copy_image_filters "nacl"
    compile="${NACL_TOOLCHAIN_BIN}/x86_64-nacl-clang++"
    compileFlags="-c ${COMPILE_FLAGS} -std=gnu++11"
    includes="-I${SAFELIGHT_DIR} -I${SAFELIGHT_TMP}/filters -I${NACL_PEPPER_INCLUDE} -I${HALIDE_DIR}/include"
    build_and_move_object_file "${compile} ${compileFlags} ${includes} ${SAFELIGHT_DIR}/visualizers/packaged_call_runtime.cc" "packaged_call_runtime.o"
    build_nexe_shell
  fi
}

# Build dependencies needed for Safelight server
buildNaclSniffers
buildVisualizerShells
buildNexeDeps

# Builds Go libraries/executables and runs the server
go install main
${SAFELIGHT_DIR}/server/bin/main
