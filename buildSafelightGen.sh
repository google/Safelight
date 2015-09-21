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


# Script for building a Halide Safelight filter.
# Outputs a Halide filter and its corresponding .nexe, .stmt, .s, and .html files.
# Invoked in appbuilder_nexe.go

set -e

source ${SAFELIGHT_DIR}/exportEnv.sh

usage() {
 echo ./`basename $0` [GENERATOR_NAME] [GENERATOR_SOURCE] [generator_param=value...]
 exit 85
}

# Build nacl_halide first builds the Safelight filter with the Go filterFactory module.
# It then uses that filter and links it with the dependencies built by serve.sh to build a .nexe file.
# All output files are moved to the $SAFELIGHT_OUTPUT directory and printed to
# the console.
# $1 Generator name
# $2 Generator source
build_nacl_halide() {
  echo ">>>>>>>>> Buidling $1!"

  # Produces filter and corresponding stmt, assembly, and html files.
  ${SAFELIGHT_DIR}/server/bin/filterFactory $1 $2 target=x86-64-nacl-register_metadata -e stmt,assembly,html

  # Build the safelight .nexe
  compile="${NACL_TOOLCHAIN_BIN}x86_64-nacl-clang++"
  compileFlags="${COMPILE_FLAGS}"
  includes="-I${NACL_PEPPER_INCLUDE} -I${SAFELIGHT_TMP}/filters"
  deps="${SAFELIGHT_TMP}/nexe_shell.o ${SAFELIGHT_TMP}/packaged_call_runtime.o ${SAFELIGHT_TMP}/filters/$1.o ${SAFELIGHT_TMP}/nexe_verb_handler.o"
  linkFlags="-L${SAFELIGHT_TMP} -lcopy_image -L${NEXE_RELEASE_DIR}_x86_64/Release ${NEXE_LINKING_FLAGS}"
  compileNexe="${compile} ${compileFlags} ${includes} ${deps} ${linkFlags} -o $1.nexe"
  echo "${compileNexe}"
  ${compileNexe}

  mkdir -p $SAFELIGHT_OUTPUT
  mv $1.* $SAFELIGHT_OUTPUT
  mv $SAFELIGHT_TMP/filters/$1.* $SAFELIGHT_OUTPUT
 
  # We list the output files so that our server can store the file names into a FilterInfo object (see appbuilder_nexe.go).
  echo "Output:"
  ls -d ${SAFELIGHT_TMP}/output/* | grep "$1\."
}

build_nacl_halide $1 $2
