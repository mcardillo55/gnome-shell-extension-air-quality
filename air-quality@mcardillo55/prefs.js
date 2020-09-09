'use strict';

const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Lang = imports.lang;

const EXTENSIONDIR = Me.dir.get_path();
const AIRQUALITY_SETTINGS_SCHEMA = 'org.gnome.shell.extensions.airquality';

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
        this.Window.add_from_file(EXTENSIONDIR + "/air-quality-settings.ui");

        this.mainWidget = this.Window.get_object("prefs-widget")
        this.currentSensor = this.Window.get_object("current-sensor")

        this.currentSensor.connect("activate", Lang.bind(this, function() {
            this.Settings.set_string("current-sensor", this.currentSensor.get_text())
        }));

        this.loadConfig();

        this.currentSensor.set_text(this.Settings.get_string("current-sensor"))
    },

    loadConfig: function() {
        this.Settings = ExtensionUtils.getSettings(AIRQUALITY_SETTINGS_SCHEMA);
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