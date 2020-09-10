/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */
const Soup = imports.gi.Soup;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const St = imports.gi.St;

const Mainloop = imports.mainloop;
const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

const Config = imports.misc.config;
const SHELL_MINOR = parseInt(Config.PACKAGE_VERSION.split('.')[1]);

const AIRQUALITY_SETTINGS_SCHEMA = 'org.gnome.shell.extensions.airquality';

let _httpSession;

var AQIIndicator = class AQIIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, `${Me.metadata.name} Indicator`, false)

        this.user_agent = Me.metadata.uuid;

        this._aqiLabel = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            text: "..."
        });

        this.add_actor(this._aqiLabel);

        this.refresh_aqi = this.refresh_aqi.bind(this)
        this.loadConfig = this.loadConfig.bind(this)
        this._onPreferencesActivate = this._onPreferencesActivate.bind(this)

        this.menu.addAction('Update Now', this.refresh_aqi, null);
        this.menu.addAction('Preferences', this._onPreferencesActivate, null);

        this.refresh_aqi();
    }

    menuAction() {
        log('Menu item activated');
    }

    loadConfig() {
        this.Settings = ExtensionUtils.getSettings(AIRQUALITY_SETTINGS_SCHEMA);
    }

    refresh_aqi() {
        log('Refresh AQI');
        let PURPLEAIRURL = "https://www.purpleair.com/json"
        let INTERVAL = 600

        this.loadConfig();

        this.load_json_async(PURPLEAIRURL, {show: this.Settings.get_string("current-sensor")}, function(json) {
            // grab the 10 minute pm2.5 average from the stats field
            let stats = JSON.parse(json.results[0].Stats)
            let aqi = this.calculate_aqi(stats.v1)
            this._aqiLabel.text = aqi.toString();
            this._aqiLabel.set_style_class_name(this.get_style(aqi));
        })

        Mainloop.timeout_add_seconds(INTERVAL, this.refresh_aqi);
    }

    get_style(aqi) {
        if (aqi <= 50) {
            return "good"
        } else if (aqi <= 100) {
            return "moderate"
        } else if (aqi <= 150) {
            return "unhealthy_sensitive"
        } else if (aqi <= 200) {
            return "unhealthy"
        } else if (aqi <= 300) {
            return "very_unhealthy"
        } else if (aqi <= 500) {
            return "hazardous"
        }
    }

    calculate_aqi(pm25) {
        let coef, clow, ilow;

        if (pm25 <= 12.0) { // Good
            coef = 4.166
            clow = 0.0
            ilow = 0
        } else if (pm25 <= 35.4) { // Moderate
            coef = 2.103
            clow = 12.1
            ilow = 51
        } else if (pm25 <= 55.4) { // Unhealthy for Sensitive Groups
            coef = 2.462
            clow = 35.5
            ilow = 101
        } else if (pm25 <= 150.4) { // Unhealthy
            coef = 0.516
            clow = 55.5
            ilow = 151
        } else if (pm25 <= 250.4) { // Very Unhealthy
            coef = 0.990
            clow = 150.5
            ilow = 201
        } else if (pm25 <= 350.4) { // Hazardous 1
            coef = 1.991
            clow = 250.5
            ilow = 301
        } else if (pm25 <= 500.4) { // Hazardous 2
            coef = 1.327
            clow = 350.5
            ilow = 301
        }
        return Math.round(coef * (pm25 - clow) + ilow);
    }

    load_json_async(url, params, fun) {
        if (_httpSession === undefined) {
            _httpSession = new Soup.Session();
            _httpSession.user_agent = this.user_agent;
        } else {
            // abort previous requests.
            _httpSession.abort();
        }

        let message = Soup.form_request_new_from_hash('GET', url, params);

        _httpSession.queue_message(message, Lang.bind(this, function(_httpSession, message) {
            try {
                if (!message.response_body.data) {
                    fun.call(this, 0);
                    return;
                }
                let jp = JSON.parse(message.response_body.data);
                fun.call(this, jp);
            } catch (e) {
                fun.call(this, 0);
                return;
            }
        }));
        return;
    }

    _onPreferencesActivate() {
        this.menu.actor.hide();
        if (typeof ExtensionUtils.openPrefs === 'function') {
            ExtensionUtils.openPrefs();
        } else {
            Util.spawn([
                "gnome-shell-extension-prefs",
                Me.uuid
            ]);
        }
        return 0;
    }
}

if (SHELL_MINOR > 30) {
    AQIIndicator = GObject.registerClass(
        {GTypeName: 'AQIIndicator'},
        AQIIndicator
    )
}

class Extension {
    constructor() {
        this.indicator = null;
    }

    enable() {
        log(`enabling ${Me.metadata.name} version ${Me.metadata.version}`);
        this.indicator = new AQIIndicator();
        Main.panel.addToStatusArea(`${Me.metadata.name} Indicator`, this.indicator);
    }

    disable() {
        log(`disabling ${Me.metadata.name} version ${Me.metadata.version}`)
        if (this.indicator !== null) {
            this.indicator.destroy();
            this.indicator = null;
        }
    }
}

function init() {
    return new Extension();
}
