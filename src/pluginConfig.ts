import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-sport-flags',
    version: '0.1.0',
    icon: '🚩',
    title: 'Drapeaux sport',
    description: 'Drapeau vert / orange / rouge par sport selon la prévision.',
    author: 'Alyzée Tiger <alyzee.tiger@gmail.com> (Instagram @alyzouu)',
    repository: 'https://github.com/alyzee-tiger/windy-sport-plugin',
    desktopUI: 'rhpane',
    mobileUI: 'small',
    routerPath: '/sport-flags/:lat?/:lon?',
    addToContextmenu: true,
    listenToSingleclick: true,
    private: true,
};

export default config;
