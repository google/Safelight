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

package safelight

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"os/exec"
	"time"
)

var debug = false

type runner struct {
	tempDir string
	logChan chan string
	timeout time.Duration
}

// RunCmd defines actions that execute give command and produce standard output
// or standard error streams snapshots.
type RunCmd interface {
	RunCmdAndReturnStderr(cmd *exec.Cmd) (string, error)
	RunCmdAndReturnStdout(cmd *exec.Cmd) (string, error)
}

// NewRunCmd creates new instance of RunCmd.
func NewRunCmd(tempDir string, logChan chan string, timeout time.Duration) RunCmd {
	return &runner{
		tempDir: tempDir,
		logChan: logChan,
		timeout: timeout,
	}
}

func (b *runner) runCmd(cmd *exec.Cmd, stdPipe io.ReadCloser) (string, error) {
	var result string
	completeTextChan := make(chan string)
	rawCommand := ""
	for i := 0; i < len(cmd.Args); i++ {
		rawCommand += " " + cmd.Args[i]
	}
	if debug {
		fmt.Printf("%s\n", rawCommand)
	}
	err := cmd.Start()
	if err != nil {
		return "", err
	}
	go func(reader io.Reader, completeTextChan chan string, incrChan chan string) {
		scanner := bufio.NewScanner(reader)
		fullText := ""
		for scanner.Scan() {
			text := scanner.Text() + "\n"
			if incrChan != nil {
				incrChan <- text
			}
			fullText += text
			fmt.Println(text)
		}
		if err := scanner.Err(); err != nil {
			fmt.Printf("Error scanning: %v\n", err)
		}
		completeTextChan <- fullText
	}(stdPipe, completeTextChan, b.logChan)

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()
	select {
	case <-time.After(b.timeout):
		if err := cmd.Process.Kill(); err != nil {
			return result, errors.New("Error killing: " + err.Error())
		}
		<-done // allow goroutine to exit
		result = <-completeTextChan
		return result, errors.New("Timed out, sorry.")
	case err := <-done:
		result = <-completeTextChan
		if err != nil {
			return result, err
		}
	}
	return result, nil
}

// RunCmdAndReturnStdout executes given command and returns its stderr.
func (b *runner) RunCmdAndReturnStderr(cmd *exec.Cmd) (string, error) {
	cmd.Stdout = ioutil.Discard
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return "", err
	}
	return b.runCmd(cmd, stderrPipe)
}

// RunCmdAndReturnStdout executes given command and returns its stdout.
func (b *runner) RunCmdAndReturnStdout(cmd *exec.Cmd) (string, error) {
	cmd.Stderr = ioutil.Discard
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	return b.runCmd(cmd, stdoutPipe)
}
