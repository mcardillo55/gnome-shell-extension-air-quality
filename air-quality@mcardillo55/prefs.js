'use strict';

const Soup = imports.gi.Soup;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Lang = imports.lang;

const EXTENSIONDIR = Me.dir.get_path();
const AIRQUALITY_SETTINGS_SCHEMA = 'org.gnome.shell.extensions.airquality';
const OPENWEATHER_URL_OSM = 'https://nominatim.openstreetmap.org/search';

let _httpSession;

const AirQualityPrefsWidget = new GObject.Class({
    Name: 'AirQualityExtension.Prefs.Widget',
    GTypeName: 'AirQualityExtensionPrefsWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);

        this.initWindow();

        //this.refreshUI();
    },

    Window: new Gtk.Builder(),

    initWindow: function() {
        this.user_agent = Me.metadata.uuid;

        this.Window.add_from_file(EXTENSIONDIR + "/air-quality-settings.ui");

        this.mainWidget = this.Window.get_object("prefs-widget")
        this.currentSensor = this.Window.get_object("current-sensor")
        this.searchLocation = this.Window.get_object("search-location")
        this.searchMenu = this.Window.get_object("search-menu")

        this.currentSensor.connect("activate", Lang.bind(this, function() {
            this.Settings.set_string("current-sensor", this.currentSensor.get_text())
        }));

        this.loadConfig();

        this.currentSensor.set_text(this.Settings.get_string("current-sensor"))

        this.Window.get_object("search-button").connect("clicked", Lang.bind(this, function() {
            this.clearSearchMenu();
            
            let params = {
                format: 'json',
                addressdetails: '1',
                q: this.searchLocation.get_text()
            };
            this.load_json_async(OPENWEATHER_URL_OSM, params, Lang.bind(this, function() {
                if (!arguments[0]) {
                    let item = new Gtk.MenuItem({
                        label: _("Invalid data when searching for \"%s\"").format(location)
                    });
                    this.searchMenu.append(item);
                } else {
                    let newCity = arguments[0];

                    if (Number(newCity.length) < 1) {
                        let item = new Gtk.MenuItem({
                            label: _("\"%s\" not found").format(location)
                        });
                        this.searchMenu.append(item);
                    } else {
                        var m = {};
                        for (var i in newCity) {

                            let cityText = newCity[i].display_name;
                            let cityCoord = "[" + newCity[i].lat + "," + newCity[i].lon + "]";

                            let item = new Gtk.MenuItem({
                                label: cityText + " " + cityCoord
                            });
                            //item.connect("activate", Lang.bind(this, this.onActivateItem));
                            this.searchMenu.append(item);
                        }
                    }
                }
                this.showSearchMenu();
            }));
        }));
    },

    loadConfig: function() {
        this.Settings = ExtensionUtils.getSettings(AIRQUALITY_SETTINGS_SCHEMA);
    },

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
    },

    clearSearchMenu: function() {
        let children = this.searchMenu.get_children();
        for (let i in children) {
            this.searchMenu.remove(children[i]);
        }
    },

    showSearchMenu: function() {
        this.searchMenu.show_all();
        if (typeof this.searchMenu.popup_at_widget === "function") {
            this.searchMenu.popup_at_widget(this.searchLocation, Gdk.Gravity.SOUTH_WEST, Gdk.Gravity.NORTH_WEST, null);
        }
        else
        {
            this.searchMenu.popup(null, null, Lang.bind(this, this.placeSearchMenu), 0, this.searchLocation);
        }
    },

    placeSearchMenu: function() {
        let[gx, gy, gw, gh] = this.searchName.get_window().get_geometry();
        let[px, py] = this.searchName.get_window().get_position();
        return [gx + px, gy + py + this.searchName.get_allocated_height()];
    }
});

function init() {
    ExtensionUtils.initTranslations('gnome-shell-extension-airquality');
}

function buildPrefsWidget() {
    let prefs = new AirQualityPrefsWidget();
    let widget = prefs.mainWidget;
    widget.show_all();
    return widget;
}