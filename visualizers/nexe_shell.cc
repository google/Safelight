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

#include "visualizers/packaged_call_runtime.h"
#include "visualizers/nexe_verb_handler.h"
#include "ppapi/cpp/instance.h"
#include "ppapi/cpp/module.h"
#include "ppapi/cpp/var.h"
#include "ppapi/cpp/var_array_buffer.h"
#include "ppapi/cpp/var_dictionary.h"
#include "HalideRuntime.h"

namespace {

using packaged_call_runtime::ArgumentPackagerJson;
using packaged_call_runtime::ArgvFunc;
using packaged_call_runtime::BuildHalideFilterInfoMap;
using packaged_call_runtime::HalideFilterInfo;
using packaged_call_runtime::HalideFilterInfoMap;
using packaged_call_runtime::MakePackagedCall;
using packaged_call_runtime::MetadataToJSON;
using packaged_call_runtime::NexeVerbHandlerInstance;
using std::string;
using std::unique_ptr;
using std::vector;

template <typename T>
string ScalarToString(T i) {
  std::ostringstream oss;
  oss << i;
  return oss.str();
}

// Avoid ostream thinking these are "char"...
template <>
string ScalarToString<int8_t>(int8_t i) {
  std::ostringstream oss;
  oss << static_cast<int>(i);
  return oss.str();
}

template <>
string ScalarToString<uint8_t>(uint8_t i) {
  std::ostringstream oss;
  oss << static_cast<int>(i);
  return oss.str();
}

template <>
string ScalarToString<bool>(bool i) {
  return i ? "true" : "false";
}

// Package* == PP_Var* (Pepper)
class ArgumentPackagerPepper : public ArgumentPackagerJson {
 public:
  ArgumentPackagerPepper(const pp::Var& message, const pp::Var& results)
      : input_message_(new JsonValuePepper(message)),
        output_message_(new JsonValuePepper(results)) {}

 protected:
  class JsonValuePepper : public JsonValue {
   public:
    explicit JsonValuePepper(pp::Var var) : var_(var) {}
    bool IsUndefined() const override { return var_.is_undefined(); }
    bool IsMap() const override { return var_.is_dictionary(); }
    bool AsBool(bool* value) const override {
      if (var_.is_bool()) {
        *value = var_.AsBool();
        return true;
      }
      return false;
    }
    bool AsInt32(int32_t* value) const override {
      if (var_.is_number()) {
        *value = static_cast<int32_t>(var_.AsInt());
        return true;
      }
      return false;
    }
    bool AsDouble(double* value) const override {
      if (var_.is_number()) {
        *value = var_.AsDouble();
        return true;
      }
      return false;
    }
    bool AsByteArray(vector<uint8_t>* v) const override {
      if (var_.is_array_buffer()) {
        pp::VarArrayBuffer data_buf(var_);
        v->resize(data_buf.ByteLength());
        memcpy(&(*v)[0], data_buf.Map(), data_buf.ByteLength());
        data_buf.Unmap();
        return true;
      }
      return false;
    }
    bool AsInt32Array(vector<int32_t>* v) const override {
      if (var_.is_array()) {
        pp::VarArray array(var_);
        const int len = static_cast<int>(array.GetLength());
        v->resize(len);
        for (int i = 0; i < len; ++i) {
          (*v)[i] = static_cast<int32_t>(pp::VarArray(var_).Get(i).AsInt());
        }
        return true;
      }
      return false;
    }
    unique_ptr<JsonValue> GetMember(const string& key) const override {
      pp::Var member;
      if (var_.is_dictionary()) {
        member = pp::VarDictionary(var_).Get(key);
      }
      return unique_ptr<JsonValue>(new JsonValuePepper(member));
    }
    bool SetMember(const string& key,
                   const unique_ptr<JsonValue>& value) override {
      if (var_.is_dictionary()) {
        pp::VarDictionary(var_)
            .Set(key, static_cast<const JsonValuePepper*>(value.get())->var_);
        return true;
      }
      return false;
    }

   private:
    pp::Var var_;
  };

  unique_ptr<JsonValue> NewMap() const override {
    return unique_ptr<JsonValue>(new JsonValuePepper(pp::VarDictionary()));
  }

  unique_ptr<JsonValue> NewInt32Array(const int32_t* data,
                                      size_t len) const override {
    pp::VarArray array_buf;
    array_buf.SetLength(len);
    for (size_t i = 0; i < len; ++i) {
      array_buf.Set(i, data[i]);
    }
    return unique_ptr<JsonValue>(new JsonValuePepper(array_buf));
  }

  unique_ptr<JsonValue> NewByteArray(const uint8_t* data,
                                     size_t len) const override {
    pp::VarArrayBuffer data_buf(len);
    memcpy(data_buf.Map(), data, len);
    data_buf.Unmap();
    return unique_ptr<JsonValue>(new JsonValuePepper(data_buf));
  }

  unique_ptr<JsonValue> NewInt32(int32_t i) const override {
    return unique_ptr<JsonValue>(new JsonValuePepper(pp::Var(i)));
  }

  unique_ptr<JsonValue> NewDouble(double d) const override {
    return unique_ptr<JsonValue>(new JsonValuePepper(pp::Var(d)));
  }

  unique_ptr<JsonValue> NewString(const string& s) const override {
    return unique_ptr<JsonValue>(new JsonValuePepper(pp::Var(s)));
  }

  const JsonValue* GetInputMessage() const override {
    return input_message_.get();
  }

  JsonValue* GetOutputMessage() const override { return output_message_.get(); }

 private:
  unique_ptr<JsonValue> input_message_;
  unique_ptr<JsonValue> output_message_;
};

class NaclShellInstance : public NexeVerbHandlerInstance {
 public:
  explicit NaclShellInstance(PP_Instance instance)
      : NexeVerbHandlerInstance(instance) {
    // ignore result, since failure results in empty map, which is fine
    (void)BuildHalideFilterInfoMap(&filter_info_);
  }

 protected:
  virtual void HandleVerb(const string& verb,
                          const pp::VarDictionary& message) {
    if (verb == "describe") {
      string name = message.Get("packaged_call_name").AsString();
      const HalideFilterInfo* info = FindFilterInfo(name);
      if (!info) {
        // We've already called Failure() in FindFilterInfo().
        return;
      }
      string json_raw;
      if (!MetadataToJSON(info->metadata, &json_raw)) {
        Failure("Unable to construct description");
        return;
      }
      pp::VarDictionary results;
      results.Set("description", json_raw);
      Success(results);
    } else if (verb == "call") {
      int threads = message.Get("num_threads").AsInt();
      if (threads < 1) threads = 1;
      if (threads > 32) threads = 32;
      halide_set_num_threads(threads);
      string name = message.Get("packaged_call_name").AsString();
      const HalideFilterInfo* info = FindFilterInfo(name);
      if (!info) {
        // We've already called Failure() in FindFilterInfo().
        return;
      }
      pp::VarDictionary results;
      ArgumentPackagerPepper packager(message, results);
      int result =
          MakePackagedCall(this, info->metadata, info->argv_func, &packager);
      if (result != 0) {
        // We've already called Failure() via the halide_error overload.
        return;
      }
      Success(results);
    } else {
      Failure("unknown verb");
    }
  }

 private:
  HalideFilterInfoMap filter_info_;

  const HalideFilterInfo* FindFilterInfo(const string& packaged_call_name) {
    if (packaged_call_name.empty()) {
      if (filter_info_.size() == 1) {
        return &filter_info_.begin()->second;
      }
      string msg("Expected exactly one name, found: (");
      for (auto info : filter_info_) {
        msg += info.first + " ";
      }
      msg += ")";
      Failure(msg);
      return NULL;
    } else {
      auto it = filter_info_.find(packaged_call_name);
      if (it != filter_info_.end()) {
        return &it->second;
      }
      Failure("Could not find name: (" + packaged_call_name + ")");
      return NULL;
    }
  }
};

class NaclShellModule : public pp::Module {
 public:
  NaclShellModule() : pp::Module() {}

  virtual pp::Instance* CreateInstance(PP_Instance instance) {
    return new NaclShellInstance(instance);
  }
};

}  // namespace

namespace pp {
// There is one Module object per web page, and one Instance per <embed> element
Module* CreateModule() { return new NaclShellModule(); }
}  // namespace pp

extern "C" {

void halide_print(void* /* user_context */, const char* msg) {
  NexeVerbHandlerInstance::AttemptLog(msg);
}

void halide_error(void* /* user_context */, const char* msg) {
  NexeVerbHandlerInstance::AttemptFailure(msg);
}

}  // extern "C"

#else

// Just in case we are compiled without --config=nacl, put in a harmless main()
int main() { return -1; }

#endif  // defined(__native_client__)
