(function (window) {
    'use strict';
    function getCurrentUser() {
        try {
            var raw = localStorage.getItem('wamPayCurrentUser');
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }
    function isLoggedIn() {
        var u = getCurrentUser();
        return !!(u && u.role && (u.status === 'active' || u.is_active === true));
    }
    function logout() {
        try {
            localStorage.removeItem('wamPayCurrentUser');
            localStorage.removeItem('wamPayToken');
        } catch (e) {}
        window.location.href = 'login.html';
    }
    window.AuthCheck = {
        getCurrentUser: getCurrentUser,
        isLoggedIn: isLoggedIn,
        logout: logout
    };
    window.AuthGuard = window.AuthCheck;
    console.log(' AuthCheck v1.0.1 ready');
})(window);
