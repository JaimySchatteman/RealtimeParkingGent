// Require npm packages
require('popper.js');
window.$ = window.jQuery = require('jquery');
const bootstrapjs = require('bootstrap');

// Initialize mapbox map
const mapboxgl = require('mapbox-gl/dist/mapbox-gl.js');
mapboxgl.accessToken = 'pk.eyJ1IjoiamFpbXlzIiwiYSI6ImNrZGJoZGZ5dzFkOHMyeXM4bXRqbnJyajkifQ._0wGgZ8Vtt_qY5H3M1bn7g';
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v11',
    center: [3.71667, 51.05], // starting position [lng, lat]
    zoom: 12.5 // starting zoom
});

// Initialize mapbox geocoder
const MapboxGeocoder = require('@mapbox/mapbox-gl-geocoder');
const geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl,
    language: 'nl',
    flyTo: false
});

// Define mapbox popups
const popupHover = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
});

const popupFly = new mapboxgl.Popup({
    closeButton: true,
    closeOnClick: false
});

// Global object for data storage
let geoJson = {
    'type': 'geojson',
    'data': {
        'type': 'FeatureCollection',
        'features': []
    }
}

let recentSearches = {
    'features': [],
    'type': 'FeatureCollection'
};

// Classes for simplicity
class Feature {
    constructor(type, geometry, properties) {
        this.type = type;
        this.geometry = geometry;
        this.properties = properties;
    }
}

class GarageProperties {
    constructor(name, totalCapacity, availableCapacity, address, distance) {
        this.name = name;
        this.totalCapacity = totalCapacity;
        this.availableCapacity = availableCapacity;
        this.address = address;
        this.distance = distance
    }
}

// Self calling function
;(function () {
    'use strict'

    $(document).ready(function () {

        getParkings();
        getRecentSearches();
        if (recentSearches.features.length > 0) {
            $('#recent-searches-wrapper').removeClass('d-none');
            insertRecentSearches();
        }

        $('.input-field').on('click focusin', function () {
            $('input', this).trigger('select');
            $(this).closest('div').addClass('selected');
        });
        $('.input-field').on('focusout', function () {
            $(this).closest('div').removeClass('selected');
        });

        document.getElementById('geocoder').appendChild(geocoder.onAdd(map));
        geocoder.on('result', (position) => {
            searchClosestGarage(position);
            if (recentSearches.features.length < 5) {
                addRecentSearch(position);
            } else {
                removeLastSearch();
                addRecentSearch(position);

            }
        });
    });
})();


/*
*
*  Render Sidebar Elements
*
*/

function getParkings() {
    $.ajax({
        type: 'GET',
        url: 'https://data.stad.gent/api/records/1.0/search/?dataset=bezetting-parkeergarages-real-time&q=&facet=description',
        data: {},
        success: function (data) {
            $('.sidebar-content').children().remove();
            insertAllOverviewElements(data);
            setMarkers();
            setZoomEvents();
            setEnterEvent();
            setLeaveEvent();
        }
    });
}

function insertAllOverviewElements(data) {
    data.records.forEach((garage) => {
        let name = garage.fields.name.split(' ');
        name.splice(0, 1);
        let garageProps = new GarageProperties(name,
            garage.fields.totalcapacity,
            garage.fields.availablecapacity,
            garage.fields.address,
            null);

        insertOverviewElement(garageProps);
        let popupHTMl = convertPropsToHTML(garageProps);
        let feature = new Feature('Feature', garage.geometry, popupHTMl);
        geoJson.data.features.push(feature);
    });
}

function insertOverviewElement(garageProps) {
    $('.sidebar-content').append('' +
        '<div id="' + garageProps.name + '" class="col mt-3 p-3 pl-4 bg-light sidebar-element">\n' +
        '   <h5 class="sidebar-element-title mb-3">' + garageProps.name + '</h5>\n' +
        '   <div class="d-flex flex-row justify-content-between align-items-center">\n' +
        '      <p class="spots-text">Totale Capaciteit</p>\n' +
        '      <p class="spots-number"><span class="badge badge-primary ml-3 mb-0">' + garageProps.totalCapacity + '</span></p>\n' +
        '   </div>\n' +
        '   <div class="d-flex flex-row justify-content-between align-items-center">\n' +
        '      <p class="spots-text">Aantal Vrije Plaatsen</p>\n' +
        '      <p class="spots-number"><span class="badge badge-success ml-4" >' + garageProps.availableCapacity + '</span></p>\n' +
        '   </div>\n' +
        '   <div class="d-flex flex-row align-content-center">\n' +
        '      <img src="assets/images/Location_icon.svg" alt="location-icon" class="icon">\n' +
        '      <p class="location ml-2 mb-0">' + garageProps.address + '</p>\n' +
        '   </div>\n' +
        '</div> ');
}

function convertPropsToHTML(garageProps) {
    return {
        'description':
            '<h5>' + garageProps.name + '</h5> ' +
            '<div class="d-flex flex-row justify-content-between">' +
            '<p class="spots-text">Aantal vrije plaatsen:</p>' +
            '<p class="spots-number"><span class="badge badge-success ml-4" >' + garageProps.availableCapacity + '</span></p>' +
            '</div>' +
            '<div class="d-flex flex-row align-content-center">\n' +
            '   <img src="assets/images/Location_icon.svg" alt="location-icon" class="icon">\n' +
            '   <p class="location ml-2 mb-0">' + garageProps.address + '</p>\n' +
            '</div>\n',
        'name': garageProps.name,
        'availableCapacity': garageProps.availableCapacity,
        'totalCapacity': garageProps.totalCapacity,
        'address': garageProps.address
    };
}


// Reference: https://docs.mapbox.com/mapbox-gl-js/example/geojson-markers/
// Sets all garages on the map
function setMarkers() {
    map.loadImage(
        'https://docs.mapbox.com/mapbox-gl-js/assets/custom_marker.png',
        function (error, image) {
            if (error) throw error;
            map.addImage('custom-marker', image);
            map.addSource('garagesJSON', geoJson);
            map.addLayer({
                'id': 'garages',
                'type': 'symbol',
                'source': 'garagesJSON',
                'layout': {
                    'icon-image': 'custom-marker',
                    'icon-allow-overlap': true

                }
            });
        }
    )
}


// Reference: https://docs.mapbox.com/mapbox-gl-js/example/flyto/
function setZoomEvents() {
    $('.sidebar-element').on('click', function () {
        let name = $(this).attr('id');
        geoJson.data.features.forEach((garage) => {
            if (garage.properties.name[0] === name) {
                flyToGarage(garage);
                popupFly.setLngLat(garage.geometry.coordinates)
                    .setHTML(garage.properties.description)
                    .addTo(map);
            }
        });
    });
}

// Reference: https://docs.mapbox.com/mapbox-gl-js/example/flyto/
function flyToGarage(garageToFlyTo) {
    let long = garageToFlyTo.geometry.coordinates[0];
    let lat = garageToFlyTo.geometry.coordinates[1];
    map.flyTo({
        center: [
            long,
            lat
        ],
        zoom: 15.5,
        essential: true
    });
}

/*
*
*  Hover Markers
*
*/

// Reference: https://docs.mapbox.com/mapbox-gl-js/example/popup-on-hover/
function setEnterEvent() {
    map.on('mouseenter', 'garages', function (e) {
        map.getCanvas().style.cursor = 'pointer';

        let coordinates = e.features[0].geometry.coordinates;
        let description = e.features[0].properties.description;

        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        popupHover.setLngLat(coordinates)
            .setHTML(description)
            .addTo(map);
    });
}

// Reference: https://docs.mapbox.com/mapbox-gl-js/example/popup-on-hover/
function setLeaveEvent() {
    map.on('mouseleave', 'garages', function () {
        map.getCanvas().style.cursor = '';
        popupHover.remove();
    });
}

/*
*
*  Find Closest Garage
*
*/

function searchClosestGarage(searchPosition) {
    let shortestDistance = Infinity;
    let garageToFlyTo;

    geoJson.data.features.forEach((garage, index) => {
        let distance = calculateDistance(garage.geometry.coordinates[0],
            garage.geometry.coordinates[1],
            searchPosition.result.geometry.coordinates[0],
            searchPosition.result.geometry.coordinates[1]);
        distance = distance / 1000; // convert to km
        geoJson.data.features[index].properties.distance = Math.round(distance * 100) / 100;
        if (distance < shortestDistance) {
            shortestDistance = distance;
            garageToFlyTo = garage;
        }
    });
    flyToGarage(garageToFlyTo);

    popupFly.setLngLat(garageToFlyTo.geometry.coordinates)
        .setHTML(garageToFlyTo.properties.description)
        .addTo(map);

    geoJson.data.features.sort(compare);
    rerenderSideBarElements();

}

// Reference https://www.movable-type.co.uk/scripts/latlong.html
function calculateDistance(long1, lat1, long2, lat2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (long2 - long1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
}

// Reference: https://stackoverflow.com/questions/1129216/sort-array-of-objects-by-string-property-value
function compare(a, b) {
    if (a.properties.distance < b.properties.distance) {
        return -1;
    }
    if (a.properties.distance > b.properties.distance) {
        return 1;
    }
    return 0;
}

function rerenderSideBarElements() {
    $('.sidebar-content').children().remove();
    geoJson.data.features.forEach((garage, index) => {
        insertOverviewElementWithDistance(index + 1, garage.properties);
    });
    setZoomEvents();
}

function insertOverviewElementWithDistance(index, garageProps) {
    $('.sidebar-content').append('' +
        '<div id="' + garageProps.name + '" class="col mt-3 p-3 pl-4 bg-light sidebar-element">\n' +
        '   <div class="d-flex flex-row justify-content-between align-items-baseline">' +
        '       <div class="d-flex flex-row align-items-baseline">' +
        '           <h5 class="number mr-3">' + index + '</h5>' +
        '           <h5 class="sidebar-element-title mb-3">' + garageProps.name + '</h5>' +
        '       </div>' +
        '       <h6 class="distance">' + garageProps.distance + ' km</h6>' +
        '   </div>   ' +
        '   <div class="d-flex flex-row justify-content-between align-items-center">\n' +
        '      <p class="spots-text">Totale Capaciteit</p>\n' +
        '      <p class="spots-number"><span class="badge badge-primary ml-3 mb-0">' + garageProps.totalCapacity + '</span></p>\n' +
        '   </div>\n' +
        '   <div class="d-flex flex-row justify-content-between align-items-center">\n' +
        '      <p class="spots-text">Aantal Vrije Plaatsen</p>\n' +
        '      <p class="spots-number"><span class="badge badge-success ml-4" >' + garageProps.availableCapacity + '</span></p>\n' +
        '   </div>\n' +
        '   <div class="d-flex flex-row align-content-center">\n' +
        '      <img src="assets/images/Location_icon.svg" alt="location-icon" class="icon">\n' +
        '      <p class="location ml-2 mb-0">' + garageProps.address + '</p>\n' +
        '   </div>\n' +
        '</div> ');
}

/*
*
*  Recent searches
*
*/

function addRecentSearch(position) {
    let index = getAvailableCookieIndex();
    let feature = new Feature('Feature',
        position.result.geometry,
        {'id': index, 'name': position.result.text, 'created': new Date()});
    createCookie('recent' + index, JSON.stringify(feature));
    recentSearches.features.push(feature);
    $('#recent-searches-wrapper').removeClass('d-none');
    insertRecentSearches();
}

function removeLastSearch() {
    let id = 0;
    let earliestTime = new Date(recentSearches.features[0].properties.created);
    recentSearches.features.forEach((search) => {
        if (new Date(search.properties.created) < earliestTime) {
            earliestTime = Date.parse(search.properties.created);
            id = search.properties.id;
        }
    });

    deleteCookie('recent' + id);
    recentSearches.features = recentSearches.features.filter(function (value, index, arr) {
        return id != value.properties.id;
    });
}

function getAvailableCookieIndex() {
    for (let i = 0; i < 5; i++) {
        if (getCookie('recent' + i) == null)
            return i;
    }
}

// Reference: https://www.w3schools.com/js/js_cookies.asp#:~:text=Create%20a%20Cookie%20with%20JavaScript&text=With%20JavaScript%2C%20a%20cookie%20can,date%20(in%20UTC%20time).
function createCookie(name, value) {
    document.cookie = name + "=" + value + ";";
}

// Reference: https://stackoverflow.com/questions/2144386/how-to-delete-a-cookie
function deleteCookie(name) {
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

// Gets all recent searches
function getRecentSearches() {
    for (let i = 0; i < 5; i++) {
        if (getCookie('recent' + i) != null) {
            recentSearches.features.push(JSON.parse(getCookie('recent' + i)));
        }
    }
}

// Reference: https://stackoverflow.com/questions/10730362/get-cookie-by-name
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

function insertRecentSearches() {
    $('#recent-searches').children().remove();
    $('#recent-searches').append('<h5 class="recent-searches-title">Recente Zoekopdrachten</h5>');
    recentSearches.features.forEach((search) => {
        $('#recent-searches').append(' ' +
            '<div id="recent' + search.properties.id + '" class=" recent-search d-flex flex-row justify-content-between align-items-center mt1 mb-2">\n' +
            '   <p class="m-0">' + search.properties.name + '</p>\n' +
            '   <button id="delete-recent' + search.properties.id + '" class="btn btn-danger delete-recent">\n' +
            '      <svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-trash-fill" fill="currentColor" xmlns="http://www.w3.org/2000/svg">\n' +
            '          <path fill-rule="evenodd" d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zM8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5zm3 .5a.5.5 0 0 0-1 0v7a.5.5 0 0 0 1 0v-7z"/>\n' +
            '      </svg>\n' +
            '   </button>\n' +
            '</div>')
    });
    setDeleteEvent();
}

function setDeleteEvent() {
    $('.delete-recent').on('click', function () {
        let parentId = $(this).parent().attr('id');
        let id = Number.parseInt(parentId[parentId.length - 1]);
        deleteCookie(parentId);
        recentSearches.features = recentSearches.features.filter(function (value, index, arr) {
            return value.properties.id != id
        });
        insertRecentSearches();
        if (recentSearches.features.length === 0) {
            $('#recent-searches-wrapper').addClass('d-none');
        }
    });
}