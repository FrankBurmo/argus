/* ================================================================
   Argus Frontend — DOM-hjelpere
   ================================================================ */
"use strict";

/** Kort selector — querySelector. */
export function $(sel) { return document.querySelector(sel); }

/** Kort selector — querySelectorAll. */
export function $$(sel) { return document.querySelectorAll(sel); }

/** Escape strenger trygt før innsetting i innerHTML. */
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Vis en kortvarig toast-melding nederst på siden. */
export function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
