const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Gio = imports.gi.Gio;
const Lang= imports.lang;
const St =imports.gi.St;

const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const TD_CLIENT_APP = '/opt/TheftDeterrentclient/client/Theft_Deterrent_client.autorun'
const ICO_UNKNOWN = '0';
const ICO_CONNECTED_INACTIVE = '1';
const ICO_DISCONNECTED_INACTIVE_URI = '2';
const ICO_ABOUT_EXPIRE = '3';
const ICO_DISCONNECTACTIVE = '4';
const ICO_DOWNLOADING = '5';
const ICO_PERMANENT = '6';
const ICO_PROTECTED = '7';
const ICO_UPGRADING = '8';

let LabMessageDlg,clientNotifyProxyInstance;
let trayIconButton,menuItemList;
let infodata, iconFolder;

menuItemList = {"Open Theft Deterrent client":"item1", "Help":"item2", "About":"item3", "Log in Theft Deterrent server":"item4"};

const TDClientNotifyIface = '<node> \
<interface name="com.intel.cmpc.td.client"> \
    <method name="GetInfo"> \
        <arg direction="out"  type="a{ss}" /> \
        <arg direction="in" type="s" /> \
    </method> \
    <method name="OnMenuItemClick"> \
        <arg direction="in" type="s" /> \
    </method> \
    <method name="GetMenuItemInfo"> \
        <arg direction="in" type="s" /> \
        <arg direction="out" type="a{ss}" /> \
    </method> \
    <signal name="TDInfoChanged"> \
        <arg direction="out" type="a{ss}" /> \
    </signal> \
</interface> \
</node>';

const SessionNotifyIface = '<node> \
<interface name="org.gnome.SessionManager.Presence"> \
    <signal name="StatusChanged"> \
        <arg direction="out" type="u" /> \
    </signal> \
</interface> \
</node>';

function AppMenuItem() {
    this._init.apply(this, arguments);
}

AppMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (lblText,lblId,appMenu, notify, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);
        this.label = new St.Label({ text: String(lblText) });
        this.actor.add_child(this.label);
        this._notify=notify;
        this._text = lblText;
        this._idTxt = lblId;
        this._appMenu = appMenu;
    },

    activate: function (event) {
        this._notifyApp(this._idTxt);
        PopupMenu.PopupBaseMenuItem.prototype.activate.call(this, event);
    },

    _notifyApp: function (label) {
        this._notify.OnMenuItemClickRemote(label);
    }
};

function AppMenuItemHeader() {
    this._init.apply(this, arguments);
}

AppMenuItemHeader.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (lblText,lblId,appMenu, notify, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);
        
        this.box = new St.BoxLayout({style_class: 'popup-combobox-item'});
        this.icon = GetTDStateIcon(GetFileName_m(infodata[0]["id"]));
        
        this.box.add(this.icon);
        if(infodata[0]['lines'] != "2") {
              this.label = new St.Label({text: infodata[0]['header']});
        } else {
              this.label = new St.Label({ style_class: 'info-label', text: infodata[0]['header']});
        }
      
        this.label.clutter_text.line_wrap = true;
        this.box.add(this.label);
        this.actor.add_child(this.box);
    },
};

function AppMenu(metadata, notify) {
    this._init(metadata, notify);
}

AppMenu.prototype = {
    __proto__: PanelMenu.Button.prototype,
    _init: function(metadata, notify) {
        PanelMenu.Button.prototype._init.call(this, 0.0);
        this.iconFolder = metadata.path + '/icon/';
        
        this.setIconEx('LogoUnknown_s.png');
        this.actor.add_actor(this._iconActor);
        this.actor.add_style_class_name('panel-status-button');

        this._notify = clientNotifyProxyInstance;
        Main.panel.addToStatusArea('tdclient', this);
        
        this.actor.connect('enter-event', Lang.bind(this, function(b) {
            clientNotifyProxyInstance.GetMenuItemInfoRemote('Refresh', _refreshMenuList);
            clientNotifyProxyInstance.GetInfoRemote('GetInfo', _refreshTaskBarIcon);
        }));

        this.actor.connect('button-press-event', Lang.bind(this, function(c) {
            clientNotifyProxyInstance.GetInfoRemote('GetInfo', _refreshTaskBarIcon);
        }));
    },

    handleEvent : function(eventId) {
        if ("AppMenuRefresh"==eventId)
        {
            clientNotifyProxyInstance.GetMenuItemInfoRemote('Refresh', _refreshMenuList);
        }
    },
                   
    reset : function() {
        this.menu.removeAll();
        if(menuItemList == null) {
            return;
        }
        
        var keyList = [];
        for(var key in menuItemList[0]) {
            if (menuItemList[0].hasOwnProperty(key)) {
                keyList.push(key);
            }
        }
        keyList.sort();
        this.menu.addMenuItem(new AppMenuItemHeader(value,"",this,this._notify, {reactive: false}));
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        for(var index = 0 ;index< keyList.length; index++) {
            if (menuItemList[0].hasOwnProperty(keyList[index])) {
                var value = menuItemList[0][keyList[index]];
                this.menu.addMenuItem(new AppMenuItem(value,keyList[index],this,this._notify));
            }
        }
    },
    
    setIconEx : function(icon_name) {
        this._iconActor = GetIconEx(icon_name);
    },
    
    changeActor :function(icon_name) {
        this.actor.remove_actor(this._iconActor);
        this._iconActor = null;
        this.setIconEx(icon_name);
        this.actor.add_actor(this._iconActor);
    },
    
    AddMenuItem : function(id) {
        if (menuItemList.hasOwnProperty(id)) {
            var value = menuItemList[id];
            this.menu.addMenuItem(new AppMenuItem(value,id,this,this._notify));
        } else {
            this.menu.addMenuItem(new AppMenuItem(id,id,this,this._notify));
        }
    },
};

//Extension main functions
//first call of the extension
function init(metadata) {
    
    iconFolder = metadata.path + '/icon/';
    //Create the remote object, based on the correct parh and bus name
    let TDNotifyProxy = Gio.DBusProxy.makeProxyWrapper(TDClientNotifyIface);
    clientNotifyProxyInstance = new TDNotifyProxy(Gio.DBus.session,
                                                    'com.intel.cmpc.td.client',
                                                    '/com/intel/cmpc/td/client');

    //Set the delegate to the TDInfoChanged Event
    clientNotifyProxyInstance.connectSignal("TDInfoChanged",_TDInfoChanged);
    
    let SessionNotificationProxy = Gio.DBusProxy.makeProxyWrapper(SessionNotifyIface);
    sessionDbusNotify = new SessionNotificationProxy(Gio.DBus.session,
                                                    'org.gnome.SessionManager',
                                                    '/org/gnome/SessionManager/Presence');
                                                    
    sessionDbusNotify.connectSignal("StatusChanged",_SessionStatusChanged);                                                
    //Create the tray icon button
    trayIconButton = new AppMenu(metadata, clientNotifyProxyInstance);

    clientNotifyProxyInstance.GetInfoRemote('Refresh', _refreshTaskBarIcon);

    this.enable();
}

function enable() {
    //Add the appMenu object on the right box

    //Async callback to retrieve the content of the appMenu items
    clientNotifyProxyInstance.GetMenuItemInfoRemote('INIT', _refreshMenuList);
    if(typeof Main.panel._menus == "undefined")
        Main.panel.menuManager.addMenu(tranIconButton.menu);
    else
        Main.panel._menus.addMenu(trayIconButton.menu);
}

//Method called when the application is disabled
function disable() {
    //Destroy the appmenu object
    trayIconButton.destroy();
}

function _DisconnectToUI() {
    trayIconButton.changeActor(GetFileName(ICO_UNKNOWN));
    menuItemList = null;
    trayIconButton.reset();
    let app_info = Gio.app_info_create_from_commandline(TD_CLIENT_APP,null,0,null);
    app_info.launch([],null,null);
}

function _refreshMenuList(msg) {
    if(msg == null) {
        _DisconnectToUI();
        return;
    }
    menuItemList = msg;
    trayIconButton.reset();
}

function _refreshTaskBarIcon(data) {
    if (data == null) {
        _DisconnectToUI();
        return;
    }
    infodata = data;
    var ico_id = data[0]['id'];
    trayIconButton.changeActor(GetFileName(ico_id));
}

function GetFileName(ico_id) {
    if(ico_id == ICO_UNKNOWN) {
        return "LogoUnknown_s.png";
    } else if(ico_id == ICO_CONNECTED_INACTIVE) {
        return "LogoInctive_s.png";
    } else if(ico_id == ICO_DISCONNECTED_INACTIVE_URI) {
        return "LogoDisconnectedInactive_s.png";
    } else if(ico_id == ICO_ABOUT_EXPIRE) {
        return "LogoAbouttoExpire_s.png";
    } else if(ico_id == ICO_DISCONNECTACTIVE) {
        return "LogoDisconnectedActive_s.png";
    } else if(ico_id == ICO_DOWNLOADING) {
        return "LogoDownload_s.png";
    } else if(ico_id == ICO_PERMANENT) {
        return "LogoPermanent_s.png";
    } else if(ico_id == ICO_PROTECTED) {
        return "LogoProtected_s.png";
    } else if(ico_id == ICO_UPGRADING) {
        return "LogoInstall_s.png";
    }
    return "LogoUnknown_s.png";
}

function GetFileName_m(ico_id) {
    if(ico_id == ICO_UNKNOWN) {
        return "LogoUnknown_m.png";
    } else if(ico_id == ICO_CONNECTED_INACTIVE) {
        return "LogoInctive_m.png";
    } else if(ico_id == ICO_DISCONNECTED_INACTIVE_URI) {
        return "LogoDisconnectedInactive_m.png";
    } else if(ico_id == ICO_ABOUT_EXPIRE) {
        return "LogoAbouttoExpire_m.png";
    } else if(ico_id == ICO_DISCONNECTACTIVE) {
        return "LogoDisconnectedActive_m.png";
    } else if(ico_id == ICO_DOWNLOADING) {
        return "LogoDownload_m.png";
    } else if(ico_id == ICO_PERMANENT) {
        return "LogoPermanent_m.png";
    } else if(ico_id == ICO_PROTECTED) {
        return "LogoProtected_m.png";
    } else if(ico_id == ICO_UPGRADING) {
        return "LogoInstall_m.png";
    }
    return "LogoUnknown_m.png";
}

function GetIconEx(icon_name) {
        let iconPath = iconFolder + icon_name;
        let file = Gio.file_new_for_path(iconPath);
        let icon=new Gio.FileIcon({file: file})
        let stIcon = new St.Icon();
        stIcon.set_gicon(icon);
        stIcon.set_icon_size(16);
        return stIcon;
}

function GetTDStateIcon(icon_name) {
        let iconPath = iconFolder + icon_name;
        let file = Gio.file_new_for_path(iconPath);
        let icon=new Gio.FileIcon({file: file})
        let stIcon = new St.Icon();
        stIcon.set_gicon(icon);
        stIcon.set_icon_size(32);
        return stIcon;
}

function _TDInfoChanged(proxy,sender,msg) {
    _refreshTaskBarIcon(msg);
    if(msg != null) {
        if(menuItemList == null) {
            //Refresh the menu
            clientNotifyProxyInstance.GetMenuItemInfoRemote('Refresh', _refreshMenuList);
        }
    }
}

function _SessionStatusChanged(proxy,sender,id) {
    if(id == 0) {
        //The login event notify
        let app_info = Gio.app_info_create_from_commandline(TD_CLIENT_APP,null,0,null);
        app_info.launch([],null,null);
        clientNotifyProxyInstance.GetInfoRemote('GetInfo', _refreshTaskBarIcon);
    }
}

function _showGlobalText(label) {
    //Add the notification message to the desktop
    LabMessageDlg = new St.Label({ style_class: 'message-label', text: label  });
    Main.uiGroup.add_actor(LabMessageDlg);
    LabMessageDlg.opacity = 255;

    //Place the message in the center of the screen
    let monitor = Main.layoutManager.primaryMonitor;
    LabMessageDlg.set_position(Math.floor(monitor.width / 2 - LabMessageDlg.width / 2),
          Math.floor(monitor.height / 2 - LabMessageDlg.height / 2));

    //Add a transition to remove the message shortly after it appears
    Tweener.addTween(LabMessageDlg,
         { opacity: 0,
           time: 4,
           transition: 'easeOutQuad',
            onComplete: _hideGlobalText });
}

function _hideGlobalText() {
    Main.uiGroup.remove_actor(LabMessageDlg);
    LabMessageDlg = null;
}
