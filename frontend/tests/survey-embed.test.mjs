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

test("Umfragebutton liegt im User-View direkt unter dem Hauptmenü auf oberster Ebene", async () => {
  const [html, styles, appSource] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8"),
    readFile(new URL("../ar/App.js", import.meta.url), "utf8")
  ]);
  const menuButtonIndex = html.indexOf('id="menu-button"');
  const surveyButtonIndex = html.indexOf('id="user-menu-survey-button"');
  const menuOverlayIndex = html.indexOf('id="menu-overlay"');
  const hudIndex = html.indexOf('id="hud"');

  assert.ok(menuButtonIndex >= 0);
  assert.ok(surveyButtonIndex > menuButtonIndex);
  assert.ok(menuOverlayIndex > surveyButtonIndex);
  assert.ok(hudIndex > menuOverlayIndex);
  assert.match(html, /id="user-menu-survey-button"[\s\S]*?aria-controls="card-survey"[\s\S]*?aria-label="An Umfrage teilnehmen"[\s\S]*?<svg class="survey-action-icon"/);
  assert.match(styles, /\.floating-action-stack\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?gap:\s*10px;/);
  assert.match(styles, /body\[data-ui-mode="user"\] \.hud\s*\{[\s\S]*?right:\s*74px;[\s\S]*?width:\s*auto;/);
  assert.match(styles, /#ui-container\s*\{[\s\S]*?pointer-events:\s*none;/);
  assert.match(styles, /\.floating-action-stack\s*\{[\s\S]*?pointer-events:\s*auto;/);
  assert.match(appSource, /overlayRoot:\s*this\.document\.getElementById\("ui-container"\)/);
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
