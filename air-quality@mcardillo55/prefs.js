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
const OPENSTREETMAP_URL = 'https://nominatim.openstreetmap.org/search';
const PURPLEAIR_URL = "https://www.purpleair.com/json"

let _httpSession;

const AirQualityPrefsWidget = new GObject.Class({
    Name: 'AirQualityExtension.Prefs.Widget',
    GTypeName: 'AirQualityExtensionPrefsWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);

        this.initWindow();
    },

    Window: new Gtk.Builder(),

    initWindow: function() {
        this.user_agent = Me.metadata.uuid;

        this.Window.add_from_file(EXTENSIONDIR + "/air-quality-settings.ui");

        this.mainWidget = this.Window.get_object("prefs-widget")
        this.currentSensor = this.Window.get_object("current-sensor")
        this.searchLocation = this.Window.get_object("search-location-entry")
        this.searchMenu = this.Window.get_object("search-menu")
        this.searchMenuWidget = this.Window.get_object("search-menu-widget");
        this.searchTreeview = this.Window.get_object("search-treeview");
        this.searchListstore = this.Window.get_object("search-liststore");
        this.treeview = this.Window.get_object("tree-treeview")
        this.liststore = this.Window.get_object("tree-liststore")

        this.searchSelection = this.Window.get_object("search-selection");
        this.searchSelection.connect("changed", Lang.bind(this, function(selection) {
            this.searchSelectionChanged(selection);
        }));

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

        column = new Gtk.TreeViewColumn();
        column.set_title("Result");
        this.searchTreeview.append_column(column);

        renderer = new Gtk.CellRendererText();
        column.pack_start(renderer, null);
        column.add_attribute(renderer, "text", 0);

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

        this.searchLocation.connect("activate", Lang.bind(this, this.findClosestSensors));

        this.Window.get_object("search-button").connect("clicked", Lang.bind(this, this.findClosestSensors));

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

    findClosestSensors: function() {
        this.clearSearchMenu();
        
        let location = this.searchLocation.get_text().trim();
        if (location === "")
            return 0;

        let params = {
            format: 'json',
            addressdetails: '1',
            q: location
        };
        this.load_json_async(OPENSTREETMAP_URL, params, Lang.bind(this, function() {
            this.clearSearchMenu();
            if (!arguments[0]) {
                this.appendToSearchList(("Invalid data when searching for \"%s\"").format(location));
            } else {
                let newCity = arguments[0];

                if (Number(newCity.length) < 1) {
                    this.appendToSearchList(("\"%s\" not found").format(location));
                } else {
                    var m = {};
                    for (var i in newCity) {
                        let cityText = newCity[i].display_name;
                        let cityCoord = "[" + newCity[i].lat + "," + newCity[i].lon + "]";
                        this.appendToSearchList(cityText + " " + cityCoord);
                    }
                }
            }
            this.showSearchMenu();
            return 0;
        }));
    },

    searchSelectionChanged: function(select) {
        let a = select.get_selected_rows()[0][0];
        if ( a !== undefined ) {
            let b = this.searchListstore.get_iter(a);
            let selectionText = this.searchListstore.get_value(b[1], 0).toString();
            this.searchLocation.set_text(selectionText);

            let coords = selectionText.split(/\[/)[1].split(/\]/)[0]
            let lat = coords.split(",")[0]
            let lon = coords.split(",")[1].trim()

            this.liststore.clear()
            let iter = this.liststore.append();
            this.liststore.set_value(iter, 0, "Loading closest sensors...");

            this.load_json_async(PURPLEAIR_URL, {"lat": lat, "lon": lon}, Lang.bind(this, function() {
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
        }
        this.clearSearchMenu();
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

    appendToSearchList: function(text) {
        let current = this.searchListstore.get_iter_first();

        current = this.searchListstore.append();
        this.searchListstore.set_value(current, 0, text);
    },

    clearSearchMenu: function() {
        this.searchSelection.unselect_all();
        this.searchSelection.set_mode(Gtk.SelectionMode.NONE);
        if (this.searchListstore !== undefined)
            this.searchListstore.clear();
        this.searchMenuWidget.hide();
    },

    showSearchMenu: function() {
        this.searchSelection.unselect_all();
        this.searchMenuWidget.set_title("Choose location...")
        this.searchMenuWidget.show();
        this.searchSelection.set_mode(Gtk.SelectionMode.SINGLE);
    },
});

function init() {
    ExtensionUtils.initTranslations('gnome-shell-extension-airquality');
}

function buildPrefsWidget() {
    let prefs = new AirQualityPrefsWidget();
    let widget = prefs.mainWidget;
    return widget;
}