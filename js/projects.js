var ATMIRE_ICON = 'https://benoit-atmire.github.io/projects_status/img/logo_white.svg';
var CLOCK_ICON = 'https://benoit-atmire.github.io/projects_status/img/clock.svg';
var CLOCK_ICON_WHITE = 'https://benoit-atmire.github.io/projects_status/img/clock_white.svg';
var W2P_ICON = 'https://benoit-atmire.github.io/projects_status/img/w2p.png';
var TRACKER_ICON = 'https://benoit-atmire.github.io/projects_status/img/tracker.svg';
var REFRESH_ICON = 'https://benoit-atmire.github.io/projects_status/img/refresh.svg';
var MONEY_ICON = 'https://benoit-atmire.github.io/projects_status/img/money.svg';
var MONEY_ICON_WHITE = 'https://benoit-atmire.github.io/projects_status/img/money-white.svg';

var Promise = TrelloPowerUp.Promise;

TrelloPowerUp.initialize({
    'board-buttons': function (t, options) {
        return [{
            icon: ATMIRE_ICON,
            text: 'Update projects list',
            callback: function (t) {
                updateProjects(t);
            },
            condition: 'edit'
        }];
    },
    'show-settings': function(t, options){
        return t.popup({
            title: 'Settings',
            url: 'views/settings.html',
            height: 184,
            width: 600
      });
    },
    'card-badges': async function(t, options) {
        await updateCard(t);
        return getBadges(t, false); 
    },
    'card-detail-badges': function(t, options) {
        return getBadges(t, true); 
    },
    'card-buttons': function(t, options){
        return getCardButtons(t);
    },
    'card-back-section': function(t, options){
        return getCardBackSection(t);
    }
});

function getBadges(t, detailed) {
    // Start by loading all the card data
    return t.getAll()
        .then(function (plugindata) {
            
                // Plugindata contains all stored values in the card
                var carddata = (plugindata.card && plugindata.card.shared) ? plugindata.card.shared : {};
                var projectdata = carddata.project || {}; // Shared data that replicates and stores the content from the API
                var sladata = carddata.sla || {}; // Shared data that contains the SLA details

                var badges = []; // Initialise the array of badges we want to see

                // If we don't have projectdata, there won't be badges, so we can already quit this

               if (!projectdata.pid) return badges;

                /* Now we can start generating the badges we need, being: 
                *   - an icon with a link to the project
                *   - an icon with a link to the tracker if the project is an SLA and that the tracker has been included
                *   - for fixed price projects, a counter of days left before next phase
                *   - for SLAs, the margin
                * */

                // Project icon
                if (projectdata && projectdata.pid && projectdata.pid.value && projectdata.pid.value !== "") {
                    badges.push({
                        icon: W2P_ICON,
                        text: detailed ? 'W2P' : null,
                        url: "https://web2project.atmire.com/web2project/index.php?m=projects&a=view&project_id=" + projectdata.pid.value,
                        title: 'Project'
                    });
                }

                // If the card is an SLA

                if (sladata && sladata.tracker && sladata.tracker !== ""){
                    badges.push({
                        icon: TRACKER_ICON,
                        text: detailed ? 'Tracker' : null,
                        url: "https://tracker.atmire.com/tickets-" + sladata.tracker,
                        title: 'Tracker'
                    });
    
                    // Next badge is commented out since not immediately possible with new API
                    /*var balance = -Math.round(sladata.all_time_diff);
    
                    badges.push({
                        icon: balance < 0 ? MONEY_ICON_WHITE : MONEY_ICON,
                        title: 'Margin',
                        text: balance + (detailed ? " credits" : ""),
                        color: balance < 0 ? "red" : null
                    });*/
                }
                // If not, we can assume it's fixed price project
                else {
                    var endphase;
                    if (projectdata.project_status.value == "In Planning" || projectdata.project_status.value == "In Progress") endphase = projectdata.end_impl.value;
                    else endphase = projectdata.end_date.value;
                    console.log
                    var endphase_dt = new Date(endphase);
        
                    var today = new Date();
                    var daysleft = Math.floor((endphase_dt - today) / (1000 * 60 * 60 * 24));
        
                    if (daysleft >= 0) badges.push({
                        icon: daysleft > 15 ? CLOCK_ICON : CLOCK_ICON_WHITE,
                        text: daysleft + (detailed ? " day" + (daysleft < 2 ? "" : "s") : ""),
                        color: daysleft > 15 ? null : 'red',
                        title: 'Days before next phase'
                    });

                }
                // We're done with the badges, we can return them
                return badges;
        });
}

async function updateCard(t) { // Asynchronous: source: https://stackoverflow.com/questions/28250680/how-do-i-access-previous-promise-results-in-a-then-chain
    
    // Retrieve the data from the board ...
    var data = await Promise.all([t.getAll(), t.lists('all')]); // async call so we build the next steps on the resolved values

    // ... and store them in conveniently named variables
    var boarddata = data[0] || {};
    var lists_table = data[1] || {}; 
    var settings = (boarddata.board.private && boarddata.board.private.settings) ? boarddata.board.private.settings : {};
    var project_data = (boarddata.card.shared && boarddata.card.shared.project) ? boarddata.card.shared.project : {}; 
    var pid = project_data.pid ? project_data.pid.value : 0;
    var labels = boarddata.board.shared.labels;

    // If we don't have a pid, there's nothing much to do, so we can quit
    if (!pid) return false;

    // If card is already up-to-date, we can also quit
    var lastsyncdate = project_data.week ? new Date(project_data.week.value) : new Date(0);                    
    var today = new Date();
    var lastweek = new Date(today.toISOString().substring(0,10)); // doing this in 2 steps prevents conflicts with hours being different
    lastweek.setDate(lastweek.getDate()-(lastweek.getDay() || 7)-6); // we're interested only in weeks that are finished

    if (lastweek.getTime() <= lastsyncdate.getTime()) return false;

    // In order to fine-tune the reports, let's also check whether this is a new item

    var isNewCard = project_data.pm ? true : false;

    // Else, we can start retrieving the latest data for the card
    project_data = await getProjectData(pid, settings.apitoken);

    // Transforming the list table into an object formatted to retrieve list IDs based on labels
    var lists = {};
    for (var i in lists_table){lists[lists_table[i].name] = lists_table[i].id;}    

    // Let's store the current card_id in a variable so we don't have race conditions for parallel executions
    var card_id = t.getContext().card;
    // The function will need to return a Promise, as per Trello's Power Up rules, so let's embed all the processing withing a new promise
    // Also we need to update the data stored in the card for this project
                            
    return Promise.all([t.set(card_id, 'shared', 'project', project_data), new Promise( function (resolve, reject){

        // The base data for the card contains: (it overrides any previously existing data, if any, with the latest one)
        var card = {
            // The Trello API credentials
            token: settings.ttoken,
            key: settings.tkey,
            // A description with the link to the W2P project
            desc: "[W2P](https://web2project.atmire.com/web2project/index.php?m=projects%26a=view%26project_id=" + project_data.pid.value + ") %0D%0A",
            // The card title is the proejct name and the client name
            name: project_data.project_name.value + " (" + project_data.company_name.value + ")",
            // And finaly the card is placed in the list that corresponds to its status
            idList: lists[project_data.project_status.value] ? lists[project_data.project_status.value] : lists["Other"]
        };

        // We are also going to adjust the labels of the card ; this requires a separate API call for labels to add or remove, so we prepare two lists    
        var idLabels_add = [];
        var idLabels_remove = [];

        // As a first label to add, we want the project type to be in there anyway
        idLabels_add.push(labels[project_data.project_type.value] ? labels[project_data.project_type.value].id : labels["Other"].id);

        // We are also going to add a comment in the card to track the changes made since the last update
        var comment = "";

        if (project_data.project_status.changed) {
            comment += "Updated status: " + project_data.project_status.value;
            comment += " (was: " + project_data.project_status.previous + ")";
            comment += "%0D%0A";
        }

        // Project dates
        var datechanged = false;
        var datemissing = false;

        if (project_data.project_type.value !== "SLA") { // Date labels are irrelevant for SLAs

            if (project_data.start_date.value == null || project_data.start_date.value.substring(0, 10) == "0000-00-00") datemissing = true;
            else {

                if (project_data.start_date.changed) {
                    comment += "Start date: " + project_data.start_date.value.substring(0, 10);
                    comment += " (was: " + project_data.start_date.previous.substring(0, 10) + ")";
                    comment += "%0D%0A";
                    datechanged = true;
                }

            }

            if (project_data.end_impl.value == null || project_data.end_impl.value.substring(0, 10) == "0000-00-00") datemissing = true;
            else {

                if (project_data.end_impl.changed) {
                    comment += "End implementation date: " + project_data.end_impl.value.substring(0, 10);
                    comment += " (was: " + project_data.end_impl.previous.substring(0, 10) + ")";
                    comment += "%0D%0A";
                    datechanged = true;
                }

            }

            if (project_data.start_test.value == null || project_data.start_test.value.substring(0, 10) == "0000-00-00") datemissing = true;
            else {
                if (project_data.start_test.changed) {
                    comment += "Start test date: " + project_data.start_test.value.substring(0, 10);
                    comment += " (was: " + project_data.start_test.previous.substring(0, 10) + ")";
                    comment += "%0D%0A";
                    datechanged = true;
                }
            }

            if (project_data.end_date.value == null || project_data.end_date.value.substring(0, 10) == "0000-00-00") datemissing = true;
            else {

                if (project_data.end_date.changed) {
                    comment += "End date: " + project_data.end_date.value.substring(0, 10);
                    comment += " (was: " + project_data.end_date.previous.substring(0, 10) + ")";
                    comment += "%0D%0A";
                    datechanged = true;
                }

            }
        
            if (datechanged) idLabels_add.push(labels["Date changed"].id);
            if (datemissing) idLabels_add.push(labels["Date missing"].id);
            else {
                idLabels_remove.push(labels["Date missing"].id);

                var nextDeadline;

                if (project_data.project_status.value == "In Planning" || project_data.project_status.value == "In Progress") nextDeadline = new Date(project_data.end_impl.value.substring(0, 10));
                else nextDeadline = new Date(project_data.end_date.value.substring(0, 10));

                if (nextDeadline < new Date()) idLabels_add.push(labels["Outdated"].id);
                else idLabels_remove.push(labels["Outdated"].id);
            }
        }
        // Project time & budget

        if (project_data.billable_hours.changed) {
            comment += "Billable hours updated from " + project_data.billable_hours.previous + " to " + project_data.billable_hours.value;
            comment += "%0D%0A";
            idLabels_add.push(labels["Billable changed"].id);
        }


        if (project_data.worked_hours.value > 0.0) {
            comment += (project_data.worked_hours.changed ? (project_data.worked_hours.value - project_data.worked_hours.previous) : 0) + " hour(s) worked last week.";
        }
        
        if (project_data.project_type.value == "Module installation" || project_data.project_type.value == "Fixed Price Project") {
            var percentage = project_data.worked_hours.value / project_data.billable_hours.value;
            var budgetrisk = false;

            if (project_data.project_status.value == "In Planning" && percentage > 0.1) budgetrisk = true;
            if (project_data.project_status.value  == "In Progress" && percentage > 0.6) budgetrisk = true;
            if (project_data.project_status.value  == "In Test" && percentage > 0.8) budgetrisk = true;

            if (budgetrisk) idLabels_add.push(labels["Budget risk"].id);
            else idLabels_remove.push(labels["Budget risk"].id);
        }

        var action = 'PUT';
        var url = "https://api.trello.com/1/cards/" + card_id + "?";

        for (var c in card) {
            url += c + "=" + card[c] + "&";
        }

        url += "pos=top";

        // Update card list and labels
        var request = new XMLHttpRequest();

        request.open(action, url);

        request.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                
                if (comment.length > 0 && !isNewCard) createComment(card_id, comment, settings.tkey, settings.ttoken);
                if (idLabels_add.length > 0) addLabels(idLabels_add, card_id, settings.tkey, settings.ttoken);
                if (idLabels_remove.length > 0) removeLabels(idLabels_remove, card_id, settings.tkey, settings.ttoken);                        
                resolve(project_data);
            } 
        };

        request.send();
    })]);
}

function createComment(card_id, text, key, token) {

    var request = new XMLHttpRequest();

    request.addEventListener("readystatechange", function () {
        if (this.readyState === this.DONE) {
            //console.log(this.responseText);
        }
    });

    request.open("POST", "https://trello.com/1/cards/" + card_id + "/actions/comments?text=" + text + "&key="+key+"&token="+token);

    request.send(null);

}

function addLabels(labels, card_id, key, token){

    for (var l in labels) {
        //console.log("Adding label " + labels[l]);
        var xhr = new XMLHttpRequest();

        xhr.addEventListener("readystatechange", function () {
            if (this.readyState === this.DONE) {
                //console.log(this.responseText);
            }
        });

        xhr.open("POST", "https://api.trello.com/1/cards/" + card_id + "/idLabels?value=" + labels[l] + "&key=" + key + "&token=" + token);

        xhr.send(null);
    }
}

function removeLabels(labels, card_id, key, token){
    for (var l in labels){
        //console.log("Removing label " + labels[l]);
        var xhr = new XMLHttpRequest();

        xhr.addEventListener("readystatechange", function () {
            if (this.readyState === this.DONE) {
                //console.log(this.responseText);
            }
        });

        xhr.open("DELETE", "https://api.trello.com/1/cards/"+card_id+"/idLabels/"+labels[l]+"?key="+key+"&token="+token);

        xhr.send(null);
    }

}

function getCardButtons(t) {
    return t.getAll()
        .then(function (data) {
            var buttons = [];
            if (data && (!data.card || !data.card.shared || !data.card.shared.project || !data.card.shared.project.pid || !data.card.shared.project.pid.value || data.card.shared.project.pid.value == "")){
                buttons.push({
                    icon: W2P_ICON,
                    text: "Map with project",
                    callback: function (t) {
                        return t.popup({
                            title: "W2P Project",
                            url: 'views/mapproject.html'
                        })

                    },
                    condition: 'edit'
                });
            }

            else {
                buttons.push({
                    icon: W2P_ICON,
                    text: "Unmap project",
                    callback: function(t){
                        return t.remove(t.getContext().card, 'shared', 'project');
                    },
                    condition: 'admin'
                });

                if (data.card.shared && data.card.shared.project && data.card.shared.project.project_type && data.card.shared.project.project_type.value && data.card.shared.project.project_type.value == "SLA"){
                    buttons.push({
                        icon: MONEY_ICON,
                        text: "Add fixed price credits",
                        callback: function(t){
                            return t.popup({
                                title: "W2P Link",
                                url: 'views/settings.html'
                            })},
                        condition: 'admin'
                    });
                    // TODO: add refresh SLA data button
                    if (!data.card.shared.sla || !data.card.shared.sla.tracker || data.card.shared.sla.tracker == ""){
                        buttons.push({
                            icon: TRACKER_ICON,
                            text: "Link tracker",
                            callback: function (t) {
                                return t.popup({
                                    title: "Tracker ID",
                                    url: 'views/tracker.html'
                                })

                            },
                            condition: 'edit'
                        });
                    }

                }
            }
            return buttons;

        });
}

function getCardBackSection(t){
    return t.getAll()
        .then(function (plugindata){
            var settings = plugindata.board.private.settings;
            var projectdata = plugindata.card.shared.project || {};
            var sladata = plugindata.card.shared.sla || {};

            if (sladata.tracker && sladata.tracker != "") {
                /*return {
                    title: 'Tracker consumption overview',
                    icon: TRACKER_ICON,
                    content: {
                        type: 'iframe',
                        url: t.signUrl('./views/trackersection.html'),
                        height: 230
                    }
                }*/
            }

            else return {};

    });
}

function getProjectData(pid, apitoken){
    return new Promise(function (resolve, reject){
        var url = 'https://reports.atmi.re/projects/' + pid;
        var xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", url);
        xmlhttp.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                var project_data = JSON.parse(xmlhttp.responseText);
                resolve(project_data);
            }
        };
        xmlhttp.setRequestHeader('Authorization', 'Bearer ' + apitoken)
        xmlhttp.send();
    });
}

function updateProjects(t) {
    return t.getAll()
        .then(function (data){
            var settings = (data.board.private && data.board.private.settings) ? data.board.private.settings : false;
            if (!settings) return;

            return new Promise(function (resolve, reject){
                var url = 'https://reports.atmi.re/harvest/projects';
                var xmlhttp = new XMLHttpRequest();
                xmlhttp.open("GET", url);
                xmlhttp.onload = function () {
                    if (this.status >= 200 && this.status < 300) {
                        var projects = JSON.parse(xmlhttp.responseText);
                        resolve(projects);
                    }
                };
                xmlhttp.setRequestHeader('Authorization', 'Bearer ' + settings.apitoken)
                xmlhttp.send();
            });
        });
}