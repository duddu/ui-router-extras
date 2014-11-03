var ignoreDsr;
function resetIgnoreDsr() {
  ignoreDsr = undefined;
}

// Decorate $state.transitionTo to gain access to the last transition.options variable.
// This is used to process the options.ignoreDsr option
angular.module("ct.ui.router.extras").config([ "$provide", function ($provide) {
  var $state_transitionTo;
  $provide.decorator("$state", ['$delegate', '$q', function ($state, $q) {
    $state_transitionTo = $state.transitionTo;
    $state.transitionTo = function (to, toParams, options) {
      if (options.ignoreDsr) {
        ignoreDsr = options.ignoreDsr;
      }

      return $state_transitionTo.apply($state, arguments).then(
        function (result) {
          resetIgnoreDsr();
          return result;
        },
        function (err) {
          resetIgnoreDsr();
          return $q.reject(err);
        }
      );
    };
    return $state;
  }]);
}]);

angular.module("ct.ui.router.extras").service("$deepStateRedirect", [ '$rootScope', '$state', '$injector', function ($rootScope, $state, $injector) {
  var lastSubstate = {};
  var deepStateRedirectsByName = {};

  var REDIRECT = "Redirect", ANCESTOR_REDIRECT = "AncestorRedirect";

  function computeDeepStateStatus(state) {
    var name = state.name;
    if (deepStateRedirectsByName.hasOwnProperty(name))
      return deepStateRedirectsByName[name];
    recordDeepStateRedirectStatus(name);
  }

  function getConfig(state) {
    var declaration = state.deepStateRedirect;
    if (!declaration) return { dsr: false };
    var dsrCfg = { dsr: true };
    if (angular.isFunction(declaration))
      dsrCfg.fn = declaration;
    else if (angular.isObject(declaration))
      dsrCfg = angular.extend(dsrCfg, declaration);
    return dsrCfg;
  }

  function recordDeepStateRedirectStatus(stateName) {
    var state = $state.get(stateName);
    if (!state) return false;
    var cfg = getConfig(state);
    if (cfg.dsr) {
      deepStateRedirectsByName[state.name] = REDIRECT;
      if (lastSubstate[stateName] === undefined)
        lastSubstate[stateName] = {};
    }

    var parent = state.$$state && state.$$state().parent;
    if (parent != null) {
      var parentStatus = recordDeepStateRedirectStatus(parent.self.name);
      if (parentStatus && deepStateRedirectsByName[state.name] === undefined) {
        deepStateRedirectsByName[state.name] = ANCESTOR_REDIRECT;
      }
    }
    return deepStateRedirectsByName[state.name] || false;
  }

  function getParamsString(params, dsrParams) {
    function safeString(input) { return input == null ? input : input.toString(); }
    if (dsrParams === true) dsrParams = Object.keys(params);
    if (dsrParams == null) dsrParams = [];

    var paramsToString = {};
    angular.forEach(dsrParams.sort(), function(name) { paramsToString[name] = safeString(params[name]); });
    return angular.toJson(paramsToString);
  }

  $rootScope.$on("$stateChangeStart", function (event, toState, toParams, fromState, fromParams) {
    if (ignoreDsr || computeDeepStateStatus(toState) !== REDIRECT) return;
    // We're changing directly to one of the redirect (tab) states.
    // Get the DSR key for this state by calculating the DSRParams option
    var cfg = getConfig(toState);
    var key = getParamsString(toParams, cfg.params);
    var redirect = lastSubstate[toState.name][key];
    // we have a last substate recorded
    var isDSR = (redirect && redirect.state != toState.name ? true : false);
    if (isDSR && cfg.fn)
      isDSR = $injector.invoke(cfg.fn, toState);
    if (!isDSR) return;

    event.preventDefault();
    $state.go(redirect.state, redirect.params);
  });

  $rootScope.$on("$stateChangeSuccess", function (event, toState, toParams, fromState, fromParams) {
    var deepStateStatus = computeDeepStateStatus(toState);
    if (deepStateStatus) {
      var name = toState.name;
      angular.forEach(lastSubstate, function (redirect, dsrState) {
        // update Last-SubState&params for each DSR that this transition matches.
        var cfg = getConfig($state.get(dsrState));
        var key = getParamsString(toParams, cfg.params);
        if (name == dsrState || name.indexOf(dsrState + ".") != -1) {
          lastSubstate[dsrState][key] = { state: name, params: angular.copy(toParams) };
        }
      });
    }
  });

  return {
    reset: function(stateOrName) {
      if (!stateOrName) {
        angular.forEach(lastSubstate, function(redirect, dsrState) { lastSubstate[dsrState] = {}; })
      } else {
        var state = $state.get(stateOrName);
        if (!state) throw new Error("Unknown state: " + stateOrName);
        if (lastSubstate[state.name])
          lastSubstate[state.name] = {};
      }
    }
  };
}]);

angular.module("ct.ui.router.extras").run(['$deepStateRedirect', function ($deepStateRedirect) {
  // Make sure $deepStateRedirect is instantiated
}]);
