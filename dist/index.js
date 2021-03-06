"use strict";
var mods_1 = require('./mods');
var diff_calc_1 = require('./diff-calc');
var beatmap_1 = require('./beatmap');
exports.Beatmap = beatmap_1.default;
var PPCalculator;
(function (PPCalculator) {
    // turns the beatmaps' strain attributes into a larger value, suitable 
    // for pp calc. not 100% sure what is going on here, but it probably makes
    // strain values scale a bit exponentially.
    var calculateBaseStrain = function (strain) {
        return Math.pow(5.0 * Math.max(1.0, strain * 14.8148148) - 4.0, 3.0) * 0.00001;
    };
    var accuracyCalc = function (c300, c100, c50, misses) {
        var totalHits = c300 + c100 + c50 + misses;
        var accuracy = 0.0;
        if (totalHits > 0) {
            accuracy = (c50 * 50.0 + c100 * 100.0 + c300 * 300.0) /
                (totalHits * 300.0);
        }
        return accuracy;
    };
    var calc100Count = function (accuracy, totalHits, misses) {
        return Math.round(-3 / 2 * ((accuracy - 1) * totalHits + misses));
    };
    function calculate(beatmap, accuracyPercent, modifiers, combo, misses, scoreVersion) {
        if (accuracyPercent === void 0) { accuracyPercent = 100; }
        if (modifiers === void 0) { modifiers = mods_1.default.None; }
        if (combo === void 0) { combo = -1; }
        if (misses === void 0) { misses = 0; }
        if (scoreVersion === void 0) { scoreVersion = 1; }
        beatmap.applyMods(modifiers);
        var diff = diff_calc_1.default.calculate(beatmap);
        var hitObjectCount = beatmap.hitObjects.length;
        // cap misses to num objects
        misses = Math.min(hitObjectCount, misses);
        // cap acc to max acc with the given amount of misses
        var max300 = hitObjectCount - misses;
        accuracyPercent = Math.max(0.0, Math.min(accuracyCalc(max300, 0, 0, misses) * 100.0, accuracyPercent));
        // round acc to the closest amount of 100s or 50s
        var c50 = 0;
        var c100 = Math.round(-3.0 * ((accuracyPercent * 0.01 - 1.0) *
            hitObjectCount + misses) * 0.5);
        if (c100 > hitObjectCount - misses) {
            // acc lower than all 100s, use 50s
            c100 = 0;
            c50 = Math.round(-6.0 * ((accuracyPercent * 0.01 - 1.0) *
                hitObjectCount + misses) * 0.2);
            c50 = Math.min(max300, c50);
        }
        else {
            c100 = Math.min(max300, c100);
        }
        var c300 = hitObjectCount - c100 - c50 - misses;
        return calculateWithCounts(diff.aim, diff.speed, beatmap, modifiers, combo, misses, c300, c100, 0, scoreVersion);
    }
    PPCalculator.calculate = calculate;
    function calculateWithCounts(aim, speed, beatmap, modifiers, combo, misses, c300, c100, c50, scoreVersion) {
        if (modifiers === void 0) { modifiers = mods_1.default.None; }
        if (combo === void 0) { combo = -1; }
        if (misses === void 0) { misses = 0; }
        if (c300 === void 0) { c300 = -1; }
        if (c100 === void 0) { c100 = 0; }
        if (c50 === void 0) { c50 = 0; }
        if (scoreVersion === void 0) { scoreVersion = 1; }
        if (!beatmap.combo)
            throw new Error("Max combo cannot be zero");
        if (scoreVersion !== 1 && scoreVersion !== 2)
            throw new Error("This score version does not exist or isn't supported");
        var overallDifficulty = beatmap.overallDifficulty;
        var approachRate = beatmap.approachRate;
        var circles = beatmap.circleCount;
        if (c300 <= 0)
            c300 = beatmap.hitObjects.length - c100 - c50 - misses;
        combo = combo <= 0 ? beatmap.combo : combo;
        var totalHits = c300 + c100 + c50 + misses;
        // accuracy (not in percentage, ranges between 0 and 1)
        var accuracy = accuracyCalc(c300, c100, c50, misses);
        // length bonus (reused in speed pp)
        var totalHitsOver2k = totalHits / 2000.0;
        var lengthBonus = 0.95 +
            0.4 * Math.min(1.0, totalHitsOver2k) +
            (totalHits > 2000 ? (Math.log(totalHitsOver2k) / Math.LN10) * 0.5 : 0.0);
        // miss penality (reused in speed pp)
        var missPenalty = Math.pow(0.97, misses);
        // combo break penality (reused in speed pp)
        var comboBreakPenalty = Math.pow(combo, 0.8) / Math.pow(beatmap.combo, 0.8);
        var approachRateBonus = 1.0;
        // high ar bonus
        if (approachRate > 10.33) {
            approachRateBonus += 0.45 * (approachRate - 10.33);
        }
        else if (approachRate < 8.0) {
            var lowArBonus = 0.01 * (8.0 - approachRate);
			if(modifiers & mods_1.default.Hidden) lowArBonus *= 2;
            approachRateBonus += lowArBonus;
        }
        // accuracy bonus (bad aim can lead to bad accuracy, reused in speed for same reason)
        var accuracyBonus = 0.5 + accuracy / 2.0;
        // od bonus (low od is easy to accuracy even with shit aim, reused in speed ...)
        var overallDifficultyBonus = 0.98 + Math.pow(overallDifficulty, 2) / 2500.0;
        var aimValue = calculateBaseStrain(aim)
            * lengthBonus
            * approachRateBonus
            * accuracyBonus
            * overallDifficultyBonus
            * missPenalty
            * comboBreakPenalty
            * (modifiers & mods_1.default.Flashlight ? 1.45 * lengthBonus : 1);
        if(modifiers & mods_1.default.Hidden) {
            aimValue *= 1.02+(11-approachRate)/50;
        }
        var speedValue = calculateBaseStrain(speed) * lengthBonus
            * missPenalty * comboBreakPenalty * accuracyBonus * overallDifficultyBonus * (modifiers & mods_1.default.Hidden ? 1.18 : 1);
        var realAccuracy = 0.0; // accuracy calculation changes from scorev1 to scorev2
        if (scoreVersion === 2) {
            circles = totalHits;
            realAccuracy = accuracy;
        }
        else {
            // scorev1 ignores sliders since they are free 300s
            if (circles) {
                realAccuracy = ((c300 - (totalHits - circles)) * 300.0 +
                    c100 * 100.0 +
                    c50 * 50.0) / (circles * 300);
            }
            // can go negative if we miss everything
            realAccuracy = Math.max(0.0, realAccuracy);
        }
        // arbitrary values tom crafted out of trial and error
        var accuracyValue = Math.pow(1.52163, overallDifficulty)
            * Math.pow(realAccuracy, 24.0) * 2.83
            * Math.min(1.15, Math.pow(circles / 1000.0, 0.3))
            * (modifiers & mods_1.default.Hidden ? 1.02 : 1)
            * (modifiers & mods_1.default.Flashlight ? 1.02 : 1);
        var finalMultiplier = 1.12
            * (modifiers & mods_1.default.NoFail ? 0.90 : 1)
            * (modifiers & mods_1.default.SpunOut ? 0.95 : 1);
        return Math.pow(Math.pow(aimValue, 1.1) +
            Math.pow(speedValue, 1.1) +
            Math.pow(accuracyValue, 1.1), 1.0 / 1.1) * finalMultiplier;
    }
    PPCalculator.calculateWithCounts = calculateWithCounts;
	function calculateFull(beatmap, accuracyPercent, modifiers, combo, misses, scoreVersion) {
		let mods = 0
		if(modifiers & mods_1.default.Flashlight) mods+=1024;
		if(modifiers & mods_1.default.Hidden) mods +=8;
		let result = {
			pp: calculate(beatmap, accuracyPercent, modifiers, combo, misses, scoreVersion),
			fc: calculate(beatmap, accuracyPercent, mods, beatmap.combo, 0, scoreVersion),
			max: calculate(beatmap, 100, mods, beatmap.combo, 0, scoreVersion)
		}
		return result;
	}
	PPCalculator.calculateFull = calculateFull;
})(PPCalculator || (PPCalculator = {}));
exports.PPCalculator = PPCalculator;
;
