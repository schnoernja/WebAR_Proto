import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { UIController } from "../ar/UIController.js";

const EVASYS_SURVEY_URL =
  "https://cloud15.evasys.de/fherfurt/public/online/index/index?online_php=&p=EPARtwin&ONLINEID=160854734865186607983609822806219276567213";

test("Umfragekachel enthält die EvaSys-Umfrage ohne Tally-Abhängigkeit", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="survey-evasys-embed"/);
  assert.match(html, /data-survey-src="https:\/\/cloud15\.evasys\.de\/fherfurt\/public\/online\/index\/index\?online_php=&amp;p=EPARtwin&amp;ONLINEID=160854734865186607983609822806219276567213"/);
  assert.doesNotMatch(html, /tally\.so|data-tally-src|survey-tally-embed/i);
});

test("EvaSys-Umfrage wird beim Öffnen der Kachel genau einmal geladen", () => {
  const iframe = {
    dataset: { surveySrc: EVASYS_SURVEY_URL },
    src: ""
  };
  let queryCount = 0;
  const ui = Object.create(UIController.prototype);
  ui.document = {
    querySelectorAll(selector) {
      assert.equal(selector, "iframe[data-survey-src]:not([src])");
      queryCount += 1;
      return iframe.src ? [] : [iframe];
    }
  };

  ui.ensureSurveyEmbedLoaded();
  ui.ensureSurveyEmbedLoaded();

  assert.equal(iframe.src, EVASYS_SURVEY_URL);
  assert.equal(queryCount, 2);
});
