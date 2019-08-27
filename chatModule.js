var Chat = (function () {
    var self = {};
    
    var data = {};
    var context;
    var tags;
    var next;
    var chat;
    var uiOptions;
    var waiting = true;
    var curTag;
    var textResponse;
    var msgDelay = 1000;

    self.start = function (ctx, tgs) {
        context = ctx;
        tags = tgs;
        next = 0;
        data = {};

        context.empty();
        context.addClass('chat-context');
        context.append('<div id="chat"></div><div id="ui-control"><div id="ui-options"></div>' +
            '<div id="ui-response"><input id="response-text" /><div id="ui-submit"><i class="fas fa-arrow-up"></i></div></div></div>');
        chat = $('#chat');
        textResponse = $('#response-text');
        uiOptions = $('#ui-options');

        $('#ui-submit').click(submitInput);
        uiOptions.on('ChatResponseLoaded', function (e) {
            $('#ui-control .hidden').removeClass('hidden');
            if (curTag.tag === "text") {
                textResponse.focus();
            }
            waiting = true;
        });

        uiOptions.on('click', '.ui-option', function () {
            $(this).toggleClass('selected');
            if (curTag.tag == 'radio' && $(this).hasClass('selected')) {
                submitInput();
            }
        });

        textResponse.on("keyup", function (e) {
            filterOptions(e);
        });

        nextTag();
    };

    var addReferences = function (m) {
        var splitMsg = m.split('{{');
        var msg = splitMsg[0];

        for (var i = 1; i < splitMsg.length; i++) {
            if (splitMsg[i].includes('}}')) {
                var keys = splitMsg[i].split('}}');
                msg += data[keys[0]];
                msg += keys[1];
            }
            else {
                msg += splitMsg[i];
            }
        }

        return msg;
    }

    var addResponse = function (isRobot, m, contentFn = "") {
        waiting = false;

        var msg = addReferences(m.toString());

        chat.append('<div class="chat-response ' + (isRobot ? "robot" : "user") + '"><p>' + msg + '</p><div class="add-content"></div></div>');
        if (contentFn != "") {
            renderAdditionalContent(contentFn, $('.chat-response:last .add-content')[0]);
        }
        $('.chat-response:last')
            .velocity("scroll", { container: chat, duration: 500 })
            .velocity("fadeIn", {
                duration: 300,
                complete: function (elements) {
                    if (isRobot) {
                        uiOptions.trigger('ChatResponseLoaded');
                    }
                }
            });


    };

    var filterOptions = function (e) {
        //submit input on enter
        if (e.which == 13) {
            submitInput();
        }

        var str = textResponse.val().toLowerCase();

        $('#ui-options .ui-option').each(function () {
            $this = $(this);

            if ($this.text().toLowerCase().includes(str) || $this.attr('data-value').toLowerCase().includes(str)) {
                $this.removeClass('filtered-out');
            }
            else {
                $this.addClass('filtered-out');
            }
        });
    }

    //call function to get additional contact, when it finishes, insert its result into the content area of the appropriate response
    var renderAdditionalContent = function (contentFn, container) {
        if (curTag.showLoader) {
            $(container).html('<div class="loader"></div>');
        }
        $.when(contentFn()).then(function (content) {
            $(container).html(content);
            //Once content has rendered, scroll to it
            $('.chat-response:last')
                .velocity("scroll", { container: chat, duration: 500 })
        });
    };

    self.getData = function () {
        return data;
    }

    var nextTag = async function () {
        waiting = false;
        curTag = tags[next++];
        if (!curTag) {
            return;
        }

        addResponse(true, curTag["chat-msg"], curTag.content || "");

        if (curTag.tag && curTag.tag != "text" && curTag.tag != "custom") {
            addOptions(curTag.children);
        }

        if (curTag.submitBarStyle) {
            $('#ui-response').addClass(curTag.submitBarStyle);
        }
        else {
            $('#ui-response').removeClass();
        }

        //support custom data tags (eg clickable map) by user-supplied 'renderer' returning html into options
        //html is appended so the user can directly modify uiOptions without it being overridden
        if (curTag.tag == "custom") {
            textResponse.attr('readonly', true);
            await curTag.renderer();
            //If chat response already scrolled into view, make sure that custom content does not cover it up
            $('.chat-response:last').velocity("scroll", { container: chat, duration: 500 });
        }

        //hide submit options until response has rendered, if response has not yet rendered
        if (!waiting) {
            $('#ui-control').children(':not(#ui-response)').addClass('hidden');
        }

        //set placeholder to user spec or default
        textResponse.attr('placeholder', curTag.placeholder || "Enter text here");

        //set timeout if tag type is 'msg'
        if (curTag.type == 'msg') {
            window.setTimeout(nextTag, curTag.delay || 1000);
        }

        if (curTag.callback) {
            curTag.callback(data);
        }

    };

    var submitInput = async function () {
        if (waiting === false) {
            return;
        }
        waiting = false;

        var selected = [];
        var friendlySelected = [];



        if (curTag.tag == 'text') {
            selected = friendlySelected = textResponse.val();
        }
        //retrieve data from user supplied custom tag
        else if (curTag.tag == 'custom') {
            //TODO allow custom to return 'friendly' and 'actual' data
            var resp = (await curTag.retriever());
            selected = resp.data;
            friendlySelected = resp.friendly ? resp.friendly : selected;
            textResponse.attr('readonly', false);
        }
        else {
            $('#ui-control .selected').each(function (i, el) {
                selected.push($(el).data('value'));
                friendlySelected.push($(el).children('.text').text());
            });
            if (selected.length == 0) {
                var remaining = $('#ui-options .ui-option:not(.filtered-out)');
                if (curTag.tag === "radio" && remaining.length == 1) {
                    remaining.addClass('selected');
                }
                //TODO rethink submitting all of the options on enter for checkbox type...
                else if (curTag.tag === "checkbox") {
                    remaining.addClass('selected');
                }

                $('#ui-control .selected').each(function (i, el) {
                    selected.push($(el).data('value'));
                    friendlySelected.push($(el).children('.text').text());
                });
            }
        }

        //if no input, throw error
        if (selected.length == 0) {
            if (!curTag.optional) {
                return invalidInput(curTag.invalid || 'Invalid input');
            }
            friendlySelected = "No input provided";
        }

        //Join arrays with spaces for readability & text wrapping
        if (Array.isArray(friendlySelected)) {
            friendlySelected = friendlySelected.join(', ');
        }

        data[curTag.name] = selected;
        addResponse(false, friendlySelected);
        textResponse.val(null);
        removeOptions();

        if (curTag.success) {
            curTag.success(data);
        }

        if (next < tags.length) {
            window.setTimeout(nextTag, msgDelay);
        }

    };

    //function for external to be able to add tags
    self.addTags = function (t, i = 0) {
        var offset = next + i;
        var start = tags.slice(0, offset);
        var end = tags.slice(offset);

        tags = start.concat(t).concat(end);
    }

    var invalidInput = function (msg) {
        waiting = false;
        textResponse.val(msg);
        textResponse.addClass('invalid');
        window.setTimeout(function () {
            context.one('click', function (e) {
                textResponse.val(null);
                textResponse.removeClass('invalid');
                waiting = true;
                //TODO optional set focus back on textResponse?
            });
        }, 10);
    }

    var removeOptions = function () {
        uiOptions.addClass("hidden");
        uiOptions.empty();
    }

    var addOptions = function (options) {
        //hide options until question fully loaded
        if (waiting == false) {
            //uiOptions.addClass('hidden');
        }

        //only add options, removal will be handled in submit of user response
        //universal between checkbox and radio button, that state is handled in the curTag
        for (var i = 0; i < options.length; i++) {
            var option = options[i];
            uiOptions.append('<div class="ui-option" data-value="' + option.value + '"><p class="text">' + option.text + '</p><p class="subtext">' + (option.subtext || "") + '</p></div>');
        }
    };

    return self;
})();
