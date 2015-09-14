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

#include <pthread.h>
#include <sys/types.h>

#include "visualizers/nexe_verb_handler.h"

namespace packaged_call_runtime {
namespace {

class Locker {
 public:
  explicit Locker(pthread_mutex_t* mutex) : mutex_(mutex) {
    pthread_mutex_lock(mutex_);
  }
  ~Locker() { pthread_mutex_unlock(mutex_); }

 private:
  pthread_mutex_t* mutex_;
  explicit Locker(const Locker&);    // unimplemented
  Locker& operator=(const Locker&);  // unimplemented
};

// Note that we explicitly do *not* want thread-local storage here;
// we need to rely on this value being valid when called from arbitrary
// Halide threadpool workers. Instead, we use an ordinary global, and
// control write access to it via a mutex; in practice, this limits
// us to a single NexeVerbHandler active at any given time
// (which is a totally reasonable limitation for our purposes).
NexeVerbHandlerInstance* gActiveInstance = NULL;
pthread_mutex_t gActiveInstanceMutex = PTHREAD_MUTEX_INITIALIZER;

// ActiveInstanceSetter is a simple RAII wrapper to set gActiveInstance,
// as controlled by gActiveInstanceMutex.
class ActiveInstanceSetter {
 public:
  explicit ActiveInstanceSetter(NexeVerbHandlerInstance* instance)
      : locker_(&gActiveInstanceMutex) {
    gActiveInstance = instance;
  }
  ~ActiveInstanceSetter() { gActiveInstance = NULL; }

 private:
  Locker locker_;
};

}  // namespace

NexeVerbHandlerInstance::NexeVerbHandlerInstance(PP_Instance instance)
    : pp::Instance(instance) {
  // Can't use PTHREAD_MUTEX_INITIALIZER for a member variable without C++11;
  // just use pthread_mutex_init() instead. Sigh.
  pthread_mutex_init(&log_mutex_, NULL);
}

NexeVerbHandlerInstance::~NexeVerbHandlerInstance() {
  pthread_mutex_destroy(&log_mutex_);
}

void NexeVerbHandlerInstance::HandleMessage(const pp::Var& var_message) {
  ActiveInstanceSetter setter(this);
  ClearLog();

  if (!var_message.is_dictionary()) {
    Failure("badly formed message");
    return;
  }
  pp::VarDictionary d(var_message);
  active_verb_ = d.Get("verb").AsString();
  active_id_ = d.Get("id").AsString();
  HandleVerb(active_verb_, pp::VarDictionary(d.Get("data")));
}

void NexeVerbHandlerInstance::Success(const pp::VarDictionary& success) {
  // Ensure that only one response per id is allowed.
  if (!active_id_.empty()) {
    Locker lock(&log_mutex_);
    pp::VarDictionary response;
    response.Set("verb", "$response");
    response.Set("id", active_id_);
    response.Set("success", success);
    if (!log_.str().empty()) {
      response.Set("log", log_.str());
    }
    PostMessage(response);
    active_id_.clear();
  }
}

void NexeVerbHandlerInstance::Failure(const std::string& error) {
  // Ensure that only one response per id is allowed.
  if (!active_id_.empty()) {
    Locker lock(&log_mutex_);
    pp::VarDictionary response;
    response.Set("verb", "$response");
    response.Set("id", active_id_);
    response.Set("failure", error);
    if (!log_.str().empty()) {
      response.Set("log", log_.str());
    }
    PostMessage(response);
    active_id_.clear();
  }
}

void NexeVerbHandlerInstance::Log(const std::string& msg) {
  Locker lock(&log_mutex_);
  log_ << msg;
}

void NexeVerbHandlerInstance::ClearLog() {
  Locker lock(&log_mutex_);
  log_.str("");
}

bool NexeVerbHandlerInstance::AttemptFailure(const std::string& error) {
  if (gActiveInstance) {
    gActiveInstance->Failure(error);
    return true;
  }
  return false;
}

bool NexeVerbHandlerInstance::AttemptLog(const std::string& msg) {
  if (gActiveInstance) {
    gActiveInstance->Log(msg);
    return true;
  }
  return false;
}

}  // namespace packaged_call_runtime

#endif  // defined(__native_client__)
