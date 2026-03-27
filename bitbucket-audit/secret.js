"use strict";

const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const { Writable } = require("stream");

const SERVICE = "argus-bitbucket";
const ACCOUNT = "token";
const TOKEN_DIR = path.join(os.homedir(), ".argus");
const TOKEN_FILE = path.join(TOKEN_DIR, "token.enc");

// ---------------------------------------------------------------------------
// Hent token fra OS-sikker lagring
// ---------------------------------------------------------------------------

function getToken() {
  try {
    switch (process.platform) {
      case "win32":
        return _getWindows();
      case "darwin":
        return _getMacOS();
      default:
        return _getLinux();
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lagre token i OS-sikker lagring
// ---------------------------------------------------------------------------

function setToken(token) {
  switch (process.platform) {
    case "win32":
      return _setWindows(token);
    case "darwin":
      return _setMacOS(token);
    default:
      return _setLinux(token);
  }
}

// ---------------------------------------------------------------------------
// Spør bruker om token (skjult input)
// ---------------------------------------------------------------------------

function promptForToken() {
  return new Promise((resolve) => {
    const silentOut = new Writable({ write(_, __, cb) { cb(); } });
    process.stdout.write("Skriv inn Bitbucket-token: ");
    const rl = readline.createInterface({
      input: process.stdin,
      output: silentOut,
      terminal: true,
    });
    rl.question("", (answer) => {
      rl.close();
      console.log();
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Windows — DPAPI via PowerShell (kryptert per bruker, ingen nøkkelhåndtering)
// ---------------------------------------------------------------------------

function _getWindows() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  const b64 = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return null;

  const cmd = [
    "Add-Type -AssemblyName System.Security;",
    "$b64=[Console]::In.ReadLine();",
    "$b=[Convert]::FromBase64String($b64);",
    "$d=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');",
    "[System.Text.Encoding]::UTF8.GetString($d)",
  ].join(" ");

  const result = execSync(`powershell -NoProfile -Command "${cmd}"`, {
    encoding: "utf8",
    input: b64,
  }).trim();

  return result || null;
}

function _setWindows(token) {
  if (!fs.existsSync(TOKEN_DIR)) fs.mkdirSync(TOKEN_DIR, { recursive: true });

  const cmd = [
    "Add-Type -AssemblyName System.Security;",
    "$t=[Console]::In.ReadLine();",
    "$b=[System.Text.Encoding]::UTF8.GetBytes($t);",
    "$e=[System.Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser');",
    "[Convert]::ToBase64String($e)",
  ].join(" ");

  const encrypted = execSync(`powershell -NoProfile -Command "${cmd}"`, {
    encoding: "utf8",
    input: token,
  }).trim();

  fs.writeFileSync(TOKEN_FILE, encrypted, "utf8");
}

// ---------------------------------------------------------------------------
// macOS — Keychain
// ---------------------------------------------------------------------------

function _getMacOS() {
  try {
    const result = execFileSync("security", [
      "find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w",
    ], { encoding: "utf8" }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function _setMacOS(token) {
  execFileSync("security", [
    "add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-w", token,
  ]);
}

// ---------------------------------------------------------------------------
// Linux — freedesktop Secret Service (secret-tool)
// ---------------------------------------------------------------------------

function _getLinux() {
  try {
    const result = execFileSync("secret-tool", [
      "lookup", "service", SERVICE,
    ], { encoding: "utf8" }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function _setLinux(token) {
  execFileSync("secret-tool", [
    "store", "--label=Argus Bitbucket Token", "service", SERVICE,
  ], { input: token });
}

// ---------------------------------------------------------------------------

module.exports = { getToken, setToken, promptForToken };
