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

#if defined(__native_client__)

#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <sstream>

#include "visualizers/nexe_verb_handler.h"
#include "ppapi/cpp/instance.h"
#include "ppapi/cpp/module.h"
#include "ppapi/cpp/var.h"
#include "ppapi/cpp/var_dictionary.h"

namespace {

using packaged_call_runtime::NexeVerbHandlerInstance;

bool AppendValidTargets(pp::VarArray* a) {
  // Note that the order here is important; we want to add them in the order
  // of likely preference, so if multiple targets may be valid (e.g. both
  // x86-32 and x86-32-sse41), list in the order of likely-best-performance.
  // (Note that we shouldn't actually encounter anything here that isn't
  // nacl; the rest are included for completeness.)
  static const char* kTargets[] = {
    "arm-32-android",
    "arm-32-ios",
    "arm-32-nacl",

    "arm-64-android",
    "arm-64-ios",

    "x86-32-android-sse41",
    "x86-32-android",
    "x86-32-linux-sse41",
    "x86-32-linux",
    "x86-32-nacl-sse41",
    "x86-32-nacl",


    "x86-64-android-sse41-avx",
    "x86-64-android-sse41",
    "x86-64-android",
    "x86-64-linux-sse41-avx",
    "x86-64-linux-sse41",
    "x86-64-linux",
    "x86-64-nacl-sse41-avx",
    "x86-64-nacl-sse41",
    "x86-64-nacl",

    "pnacl-32-nacl"
  };
  int c = a->GetLength();
  for (size_t i = 0; i < sizeof(kTargets) / sizeof(kTargets[0]); ++i) {
      if (!a->Set(c++, kTargets[i])) return false;
  }
  return true;
}

class NaclSnifferInstance : public NexeVerbHandlerInstance {
 public:
  explicit NaclSnifferInstance(PP_Instance instance)
      : NexeVerbHandlerInstance(instance) {}

 protected:
  virtual void HandleVerb(const std::string& verb,
                          const pp::VarDictionary& data) {
    if (verb == "sniff_halide_targets") {
      pp::VarArray a;
      if (!AppendValidTargets(&a)) {
        Failure("sniff_halide_targets failed.");
        return;
      }
      pp::VarDictionary results;
      if (!results.Set("halide_targets", a)) {
        Failure("sniff_halide_targets failed.");
        return;
      }
      Success(results);
    } else {
      Failure("Unknown verb in NaclSniffer");
    }
  }
};

class NaclSnifferModule : public pp::Module {
 public:
  NaclSnifferModule() : pp::Module() {}

  virtual pp::Instance* CreateInstance(PP_Instance instance) {
    return new NaclSnifferInstance(instance);
  }
};

}  // namespace

namespace pp {
Module* CreateModule() { return new NaclSnifferModule(); }
}  // namespace pp
#else
// Provide a stub 'main' so that :all targets will build.
int main() {
  return 1;
}
#endif  // #if defined(__native_client__)

