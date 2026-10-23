import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {historyLine, readCareer, readChampions, readSeries, titles, versusLine} from "../site/v2/ui/history-model.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("champions: each year's winner with that year's name and franchise number, newest first", () => {
    const champions = readChampions(fixture("history-champions.html"));
    assert.equal(champions.length, 18);
    assert.deepEqual(champions[0], {year: 2025, name: "Smooth City Styles!", team: "0004"});
    assert.deepEqual(champions.find((champion) => champion.year === 2020), {year: 2020, name: "Golden Ratio", team: "0009"});
    assert.deepEqual(champions[17], {year: 2008, name: "Good Team", team: "0010"});
});

test("career records: today's teams, with the seasons MFL links to each", () => {
    const career = readCareer(fixture("history-career.html"));
    assert.equal(Object.keys(career).length, 10);
    assert.deepEqual(career["0005"], {w: 93, l: 67, t: 3, seasons: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016]});
    assert.equal(career["0001"].seasons.length, 19);
    assert.deepEqual(career["0003"].seasons, [2026]);
});

test("a series page: one team's record against each of today's teams, not the defunct ones", () => {
    const series = readSeries(fixture("history-series-0005.html"));
    assert.deepEqual(series["0001"], {w: 8, l: 13, t: 0});
    assert.deepEqual(series["0006"], {w: 17, l: 3, t: 0});
    assert.deepEqual(series["0003"], {w: 0, l: 0, t: 1});
    assert.equal(series["0005"], undefined);
    assert.equal(Object.keys(series).length, 9);
});

test("pages MFL no longer draws as expected read as nothing", () => {
    assert.equal(readChampions("<html></html>"), null);
    assert.equal(readCareer("<html>Career Records</html>"), null);
    assert.equal(readSeries("<html></html>"), null);
});

test("titles go to today's team with the champion's number, when MFL links it to that year", () => {
    const won = titles(readChampions(fixture("history-champions.html")), readCareer(fixture("history-career.html")));
    // as the commissioner confirmed; 2020's is Golden Ratio's, then franchise 0009
    assert.deepEqual(won, {
        "0004": [2013, 2025],
        "0002": [2024],
        "0005": [2020, 2022],
        "0008": [2018, 2021],
        "0001": [2015, 2019]
    });
});

test("a renumbered team's old number credits today's team, and its new number then was someone else's", () => {
    const career = {"0005": {seasons: [2018, 2019, 2020, 2021]}, "0009": {seasons: [2023]}};
    const champions = [{year: 2021, team: "0005"}, {year: 2020, team: "0009"}, {year: 2019, team: "0005"}];
    assert.deepEqual(titles(champions, career), {"0005": [2020, 2021]});
    assert.deepEqual(titles(champions, career, []), {"0005": [2019, 2021]});
});

test("the viewer's record against a team, or nothing if they've never met", () => {
    assert.equal(versusLine({w: 8, l: 13, t: 0}), "Your record vs them 8–13–0");
    assert.equal(versusLine({w: 0, l: 0, t: 1}), "Your record vs them 0–0–1");
    assert.equal(versusLine({w: 0, l: 0, t: 0}), "");
    assert.equal(versusLine(undefined), "");
});

test("a team's history line: record, first season, titles", () => {
    assert.equal(historyLine({w: 93, l: 67, t: 3, seasons: [2026, 2016, 2020]}, [2020, 2022]), "All-time 93–67–3 · since 2016 · Champion 2020, 2022");
    assert.equal(historyLine({w: 2, l: 3, t: 1, seasons: [2026]}), "All-time 2–3–1 · since 2026");
    assert.equal(historyLine(null, [2020]), "");
});
