/* ================================================================
   Argus Frontend — Felles lukke-handler for detaljpanelet
   ================================================================ */
"use strict";

import { $ } from "../utils/dom.js";

export function closeDetail() {
  $("#detail-panel").classList.add("hidden");
}
