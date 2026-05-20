import { checkAuth, isEditorialProduction } from './auth.js?v=5.1.1';
checkAuth().then(user => {
    if (user) {
        window.auth.initNavBar(user);
    }
});
