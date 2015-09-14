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

#ifndef PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_NEXE_VERB_HANDLER_H_
#define PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_NEXE_VERB_HANDLER_H_

#if defined(__native_client__)

#include <pthread.h>

#include <cstring>
#include <sstream>

#include "ppapi/cpp/instance.h"
#include "ppapi/cpp/var.h"
#include "ppapi/cpp/var_dictionary.h"

namespace packaged_call_runtime {

// A NexeVerbHandler is a unified way to handle Pepper messages with
// unique ids that are associated with a request/response protocol.
// JS must always post messages in the form
//
//   { verb: "some-string", id: "unique-string", data: { ... } }
//
// The response will always be of the form
//
//   { verb: "$response", id: "unique-string", success: { ... } }
//
//   or
//
//   { verb: "$response", id: "unique-string", failure: "error message" }
//
// Key takeaways:
//
// -- the id field of the response is an arbitrary string and
// always matches the id field of the request.
//
// -- exactly one response will be sent for each request.
//
// -- the JS host is expected to generate a unique id for the "id" field
// and to examine the responses returned to match responses appropriately.
// (If the JS host does not need to match responses, it can re-use
// ids, e.g. pass the empty string for every request)

class NexeVerbHandlerInstance : public pp::Instance {
 public:
  explicit NexeVerbHandlerInstance(PP_Instance instance);
  virtual ~NexeVerbHandlerInstance();

  virtual void HandleMessage(const pp::Var& var_message);  // override

  // If there is an active instance, call Failure() on it and return true.
  // If not, return false.
  static bool AttemptFailure(const std::string& error);

  // If there is an active instance, call Log() on it and return true.
  // If not, return false.
  static bool AttemptLog(const std::string& msg);

 protected:
  virtual void HandleVerb(const std::string& verb,
                          const pp::VarDictionary& data) = 0;

  void Success(const pp::VarDictionary& success);
  void Failure(const std::string& error);
  void Log(const std::string& msg);
  void ClearLog();

 private:
  std::string active_verb_;
  std::string active_id_;

  // Access to log_ is controlled by log_mutex_.
  std::ostringstream log_;
  pthread_mutex_t log_mutex_;
};

}  // namespace packaged_call_runtime

#endif  // defined(__native_client__)

#endif  // PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_NEXE_VERB_HANDLER_H_
