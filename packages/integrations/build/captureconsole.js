(function (__window) {
var exports = {};

/**
 * NOTE: In order to avoid circular dependencies, if you add a function to this module and it needs to print something,
 * you must either a) use `console.log` rather than the logger, or b) put your function elsewhere.
 */
var fallbackGlobalObject = {};
/**
 * Safely get global scope object
 *
 * @returns Global scope object
 */
function getGlobalObject() {
    return (typeof window !== 'undefined' // eslint-disable-line no-restricted-globals
            ? window // eslint-disable-line no-restricted-globals
            : typeof self !== 'undefined'
                ? self
                : fallbackGlobalObject);
}

var SeverityLevels = ['fatal', 'error', 'warning', 'log', 'info', 'debug', 'critical'];

/**
 * Join values in array
 * @param input array of values to be joined together
 * @param delimiter string to be placed in-between values
 * @returns Joined values
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeJoin(input, delimiter) {
    if (!Array.isArray(input)) {
        return '';
    }
    var output = [];
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (var i = 0; i < input.length; i++) {
        var value = input[i];
        try {
            output.push(String(value));
        }
        catch (e) {
            output.push('[value cannot be serialized]');
        }
    }
    return output.join(delimiter);
}

/**
 * Replace a method in an object with a wrapped version of itself.
 *
 * @param source An object that contains a method to be wrapped.
 * @param name The name of the method to be wrapped.
 * @param replacementFactory A higher-order function that takes the original version of the given method and returns a
 * wrapped version. Note: The function returned by `replacementFactory` needs to be a non-arrow function, in order to
 * preserve the correct value of `this`, and the original method must be called using `origMethod.call(this, <other
 * args>)` or `origMethod.apply(this, [<other args>])` (rather than being called directly), again to preserve `this`.
 * @returns void
 */
function fill(source, name, replacementFactory) {
    if (!(name in source)) {
        return;
    }
    var original = source[name];
    var wrapped = replacementFactory(original);
    // Make sure it's a function first, as we need to attach an empty prototype for `defineProperties` to work
    // otherwise it'll throw "TypeError: Object.defineProperties called on non-object"
    if (typeof wrapped === 'function') {
        try {
            markFunctionWrapped(wrapped, original);
        }
        catch (_Oo) {
            // This can throw if multiple fill happens on a global object like XMLHttpRequest
            // Fixes https://github.com/getsentry/sentry-javascript/issues/2043
        }
    }
    source[name] = wrapped;
}
/**
 * Defines a non-enumerable property on the given object.
 *
 * @param obj The object on which to set the property
 * @param name The name of the property to be set
 * @param value The value to which to set the property
 */
function addNonEnumerableProperty(obj, name, value) {
    Object.defineProperty(obj, name, {
        // enumerable: false, // the default, so we can save on bundle size by not explicitly setting it
        value: value,
        writable: true,
        configurable: true,
    });
}
/**
 * Remembers the original function on the wrapped function and
 * patches up the prototype.
 *
 * @param wrapped the wrapper function
 * @param original the original function that gets wrapped
 */
function markFunctionWrapped(wrapped, original) {
    var proto = original.prototype || {};
    wrapped.prototype = original.prototype = proto;
    addNonEnumerableProperty(wrapped, '__sentry_original__', original);
}

/**
 * TODO(v7): Remove this enum and replace with SeverityLevel
 */
var Severity;
(function (Severity) {
    /** JSDoc */
    Severity["Fatal"] = "fatal";
    /** JSDoc */
    Severity["Error"] = "error";
    /** JSDoc */
    Severity["Warning"] = "warning";
    /** JSDoc */
    Severity["Log"] = "log";
    /** JSDoc */
    Severity["Info"] = "info";
    /** JSDoc */
    Severity["Debug"] = "debug";
    /** JSDoc */
    Severity["Critical"] = "critical";
})(Severity || (Severity = {}));

function isSupportedSeverity(level) {
    return SeverityLevels.indexOf(level) !== -1;
}
/**
 * Converts a string-based level into a {@link Severity}.
 *
 * @param level string representation of Severity
 * @returns Severity
 */
function severityFromString(level) {
    if (level === 'warn')
        return Severity.Warning;
    if (isSupportedSeverity(level)) {
        return level;
    }
    return Severity.Log;
}

var global = getGlobalObject();
/** Send Console API calls as Sentry Events */
var CaptureConsole = /** @class */ (function () {
    /**
     * @inheritDoc
     */
    function CaptureConsole(options) {
        if (options === void 0) { options = {}; }
        /**
         * @inheritDoc
         */
        this.name = CaptureConsole.id;
        /**
         * @inheritDoc
         */
        this._levels = ['log', 'info', 'warn', 'error', 'debug', 'assert'];
        if (options.levels) {
            this._levels = options.levels;
        }
    }
    /**
     * @inheritDoc
     */
    CaptureConsole.prototype.setupOnce = function (_, getCurrentHub) {
        if (!('console' in global)) {
            return;
        }
        this._levels.forEach(function (level) {
            if (!(level in global.console)) {
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fill(global.console, level, function (originalConsoleMethod) { return function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                var hub = getCurrentHub();
                if (hub.getIntegration(CaptureConsole)) {
                    hub.withScope(function (scope) {
                        scope.setLevel(severityFromString(level));
                        scope.setExtra('arguments', args);
                        scope.addEventProcessor(function (event) {
                            event.logger = 'console';
                            return event;
                        });
                        var message = safeJoin(args, ' ');
                        if (level === 'assert') {
                            if (args[0] === false) {
                                message = "Assertion failed: " + (safeJoin(args.slice(1), ' ') || 'console.assert');
                                scope.setExtra('arguments', args.slice(1));
                                hub.captureMessage(message);
                            }
                        }
                        else if (level === 'error' && args[0] instanceof Error) {
                            hub.captureException(args[0]);
                        }
                        else {
                            hub.captureMessage(message);
                        }
                    });
                }
                // this fails for some browsers. :(
                if (originalConsoleMethod) {
                    originalConsoleMethod.apply(global.console, args);
                }
            }; });
        });
    };
    /**
     * @inheritDoc
     */
    CaptureConsole.id = 'CaptureConsole';
    return CaptureConsole;
}());

exports.CaptureConsole = CaptureConsole;


  __window.Sentry = __window.Sentry || {};
  __window.Sentry.Integrations = __window.Sentry.Integrations || {};
  for (var key in exports) {
    if (Object.prototype.hasOwnProperty.call(exports, key)) {
      __window.Sentry.Integrations[key] = exports[key];
    }
  }
  
}(window));
//# sourceMappingURL=captureconsole.js.map