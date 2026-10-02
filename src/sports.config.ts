/**
 * Seuils des drapeaux par sport.
 *
 * Règle de lecture pour chaque mesure :
 *   - dans `green`  -> drapeau vert
 *   - dans `orange` -> drapeau orange
 *   - en dehors     -> drapeau rouge
 * Le drapeau final d'un sport = le pire drapeau parmi ses mesures.
 * Une mesure configurée mais sans donnée donne orange (jamais vert à l'aveugle).
 *
 * Unités (volontairement uniques pour tout le fichier) :
 *   wind, gust   : km/h   (1 nœud ≈ 1.85 km/h)
 *   gustSpread   : km/h, rafale - vent moyen (turbulence)
 *   temp, feel   : °C     (feel = température ressentie)
 *   rain         : mm/h
 *   storm        : 0 = pas d'orage, 1 = orage prévu
 *   fog          : 0 = pas de brouillard, 1 = brouillard prévu
 *   ice          : 0 = pas de verglas, 1 = pluie verglaçante prévue
 *   waves        : m
 *   wavesPeriod  : s
 *   aqi          : indice US AQI (0 = air pur, 500 = dangereux)
 *   pm25         : particules fines PM2.5, µg/m³
 *   o3           : ozone, µg/m³
 *   alert        : alerte officielle en cours (Météo-France, NWS...) : 0 aucune, 1 jaune, 2 orange, 3 rouge
 *
 * Utiliser Infinity pour une borne ouverte, ex. [8, Infinity].
 */

export type Flag = 'green' | 'orange' | 'red';

export type Metric =
    | 'wind'
    | 'gust'
    | 'gustSpread'
    | 'temp'
    | 'feel'
    | 'rain'
    | 'storm'
    | 'fog'
    | 'ice'
    | 'waves'
    | 'wavesPeriod'
    | 'aqi'
    | 'pm25'
    | 'o3'
    | 'alert';

export type Range = [min: number, max: number];

export interface Rule {
    green: Range;
    orange: Range;
}

export interface SportConfig {
    label: string;
    icon: string;
    rules: Partial<Record<Metric, Rule>>;
}

/** Libellés affichés dans le détail. */
export const metricLabels: Record<Metric, string> = {
    wind: 'Vent (km/h)',
    gust: 'Rafales (km/h)',
    gustSpread: 'Écart rafales - vent (km/h)',
    temp: 'Température (°C)',
    feel: 'Ressenti (°C)',
    rain: 'Pluie (mm/h)',
    storm: 'Orage',
    fog: 'Brouillard',
    ice: 'Verglas',
    waves: 'Vagues (m)',
    wavesPeriod: 'Période des vagues (s)',
    aqi: 'Qualité de l\'air (AQI)',
    pm25: 'Particules fines PM2.5 (µg/m³)',
    o3: 'Ozone (µg/m³)',
    alert: 'Alerte officielle',
};

/** Libellés des mesures à valeurs discrètes (index = valeur). */
export const valueLabels: Partial<Record<Metric, string[]>> = {
    storm: ['non', 'oui'],
    fog: ['non', 'oui'],
    ice: ['non', 'oui'],
    alert: ['aucune', 'jaune', 'orange', 'rouge'],
};

/** Pour les mesures oui/non (storm, fog, ice). */
const redIfYes: Rule = { green: [0, 0], orange: [0, 0] };
const orangeIfYes: Rule = { green: [0, 0], orange: [0, 1] };

/** Alerte jaune = orange, alerte orange ou rouge = rouge. */
const officialAlert: Rule = { green: [0, 0], orange: [0, 1] };

export const sports: Record<string, SportConfig> = {
    kitesurf: {
        label: 'Kitesurf',
        icon: '🪁',
        rules: {
            alert: officialAlert,
            wind: { green: [22, 45], orange: [18, 55] },
            gust: { green: [0, 55], orange: [0, 65] },
            temp: { green: [12, Infinity], orange: [5, Infinity] },
            storm: redIfYes,
            fog: orangeIfYes,
        },
    },

    windsurf: {
        label: 'Windsurf',
        icon: '🏄‍♂️',
        rules: {
            alert: officialAlert,
            wind: { green: [20, 50], orange: [15, 60] },
            gust: { green: [0, 60], orange: [0, 70] },
            storm: redIfYes,
            fog: orangeIfYes,
        },
    },

    surf: {
        label: 'Surf',
        icon: '🌊',
        rules: {
            alert: officialAlert,
            waves: { green: [0.8, 2.5], orange: [0.5, 3.5] },
            wavesPeriod: { green: [9, Infinity], orange: [6, Infinity] },
            wind: { green: [0, 15], orange: [0, 30] },
            storm: redIfYes,
            fog: orangeIfYes,
        },
    },

    paddle: {
        label: 'Paddle',
        icon: '🛶',
        rules: {
            alert: officialAlert,
            wind: { green: [0, 12], orange: [0, 20] },
            waves: { green: [0, 0.5], orange: [0, 1] },
            storm: redIfYes,
            fog: orangeIfYes,
        },
    },

    parapente: {
        label: 'Parapente',
        icon: '🪂',
        rules: {
            alert: officialAlert,
            wind: { green: [0, 15], orange: [0, 22] },
            gust: { green: [0, 20], orange: [0, 28] },
            gustSpread: { green: [0, 10], orange: [0, 15] },
            rain: { green: [0, 0], orange: [0, 0.2] },
            storm: redIfYes,
            fog: orangeIfYes,
        },
    },

    velo: {
        label: 'Vélo route',
        icon: '🚴',
        rules: {
            alert: officialAlert,
            wind: { green: [0, 25], orange: [0, 40] },
            gust: { green: [0, 45], orange: [0, 60] },
            gustSpread: { green: [0, 20], orange: [0, 30] },
            rain: { green: [0, 0.2], orange: [0, 1] },
            temp: { green: [8, 30], orange: [2, 35] },
            storm: redIfYes,
            fog: redIfYes,
            ice: redIfYes,
            aqi: { green: [0, 50], orange: [0, 100] },
            o3: { green: [0, 100], orange: [0, 180] },
        },
    },

    course: {
        label: 'Course à pied',
        icon: '🏃',
        rules: {
            alert: officialAlert,
            feel: { green: [5, 25], orange: [-5, 32] },
            rain: { green: [0, 1], orange: [0, 4] },
            storm: redIfYes,
            fog: orangeIfYes,
            ice: orangeIfYes,
            aqi: { green: [0, 50], orange: [0, 100] },
            pm25: { green: [0, 15], orange: [0, 35] },
            o3: { green: [0, 100], orange: [0, 180] },
        },
    },

    rando: {
        label: 'Randonnée',
        icon: '🥾',
        rules: {
            alert: officialAlert,
            gust: { green: [0, 40], orange: [0, 60] },
            rain: { green: [0, 0.5], orange: [0, 2] },
            feel: { green: [0, 28], orange: [-10, 34] },
            storm: redIfYes,
            fog: orangeIfYes,
            ice: orangeIfYes,
        },
    },
};
