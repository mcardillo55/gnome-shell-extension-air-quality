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
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const St = imports.gi.St;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

const Config = imports.misc.config;
const SHELL_MINOR = parseInt(Config.PACKAGE_VERSION.split('.')[1]);

var AQIIndicator = class AQIIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, `${Me.metadata.name} Indicator`, false)

        this._aqi = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            text: "250"
        });
        //this.actor.add_child(icon);

        this.actor.add_child(this._aqi);

        this.menu.addAction('Preferences', this.menuAction, null);
    }

    menuAction() {
        log('Menu item activated');
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
