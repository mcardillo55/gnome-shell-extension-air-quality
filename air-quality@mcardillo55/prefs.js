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
const PURPLEAIR_URL = "https://www.purpleair.com/json"

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
        this.treeview = this.Window.get_object("tree-treeview")
        this.liststore = this.Window.get_object("tree-liststore")

        let column = new Gtk.TreeViewColumn();
        column.set_title("Location");
        this.treeview.append_column(column);

        let renderer = new Gtk.CellRendererText();
        column.pack_start(renderer, null);
        column.add_attribute(renderer, "text", 0);

        column = new Gtk.TreeViewColumn();
        column.set_title("Distance (mi)");
        this.treeview.append_column(column);

        column.pack_start(renderer, null);
        column.add_attribute(renderer, "text", 1);

        this.currentSensor.connect("activate", Lang.bind(this, function() {
            this.setCurrentSensor(this.currentSensor.get_text())
        }));

        this.loadConfig();

        this.currentSensor.set_text(this.Settings.get_string("current-sensor"))

        this.treeview.connect("row-activated", Lang.bind(this, function() {
            let selection = this.treeview.get_selection()
            let iter = selection.get_selected()[2]
            let selected_id = this.liststore.get_value(iter, 2)
            this.setCurrentSensor(selected_id.toString())

        }))

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
                            item.connect("activate", Lang.bind(this, this.onActivateItem));
                            this.searchMenu.append(item);
                        }
                    }
                }
                this.showSearchMenu();
            }));
        }));

        let closest_sensors = this.Settings.get_strv("closest-sensors")
        if (closest_sensors) {
            let selected_row;
            for (var i in closest_sensors) {
                let split_data = closest_sensors[i].split('>')

                let iter = this.liststore.append();
                this.liststore.set_value(iter, 0, split_data[0]);
                this.liststore.set_value(iter, 1, parseFloat(split_data[1]));
                this.liststore.set_value(iter, 2, parseInt(split_data[2]));

                if (split_data[2] == this.Settings.get_string("current-sensor")) {
                    selected_row = this.liststore.get_path(iter)
                }
            }
            if (selected_row) {
                this.treeview.set_cursor(selected_row, null, false)
            }
        }
    },

    setCurrentSensor: function(id){
        this.Settings.set_string("current-sensor", id)
        this.currentSensor.set_text(id)
    },

    getDistanceFromLatLonInKm: function(lat1,lon1,lat2,lon2) {
        //var R = 6371; // Radius of the earth in km
        var R = 3958.756; // Radius of the earth in mi
        var dLat = (lat2-lat1) * (Math.PI/180);  // deg2rad below
        var dLon = (lon2-lon1) * (Math.PI/180); 
        var a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * 
          Math.sin(dLon/2) * Math.sin(dLon/2)
          ; 
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        var d = R * c; // Distance in km
        return d;
    },

    onActivateItem: function() {
        let coords = arguments[0].get_label().split(/\[/)[1].split(/\]/)[0]
        let lat = coords.split(",")[0]
        let lon = coords.split(",")[1].trim()

        this.load_json_async(PURPLEAIR_URL, {}, Lang.bind(this, function() {
            let results = arguments[0].results

            for (var idx in results) {
                let item = results[idx]
                if (item.DEVICE_LOCATIONTYPE && item.DEVICE_LOCATIONTYPE == "outside") {
                    let distance = this.getDistanceFromLatLonInKm(parseFloat(lat), parseFloat(lon), item.Lat, item.Lon);
                    item.distance = distance;
                } else {
                    delete results[idx]
                }
            }

            results.sort((a, b) => (a.distance > b.distance) ? 1 : -1)

            this.liststore.clear()
            
            let sensors_list_for_settings = []
            for (var i=0; i<20; i++) {
                let iter = this.liststore.append();
                this.liststore.set_value(iter, 0, results[i].Label);
                this.liststore.set_value(iter, 1, results[i].distance);
                this.liststore.set_value(iter, 2, results[i].ID)
                sensors_list_for_settings.push(results[i].Label+">"+results[i].distance+">"+results[i].ID)
            }
            this.Settings.set_strv("closest-sensors", sensors_list_for_settings)
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