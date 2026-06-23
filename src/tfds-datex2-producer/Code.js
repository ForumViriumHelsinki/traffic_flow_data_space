/**
 * @file Code.js
 * @description This file contains functions for querying InfluxDB from Google Apps Script and producing Datex II output.
 */

// Datex II Templates
const TEMPLATE_DATEX_OBJECT = {
  "_type": "SituationPublication",
  "lang": "en",
  "publicationTime": "",
  "publicationCreator": {
    "_type": "InternationalIdentifier",
    "country": "FI", // Replace with your country code
    "nationalIdentifier": "YOUR_NATIONAL_IDENTIFIER" // Replace with your identifier
  },
  "situation": []
};

const TEMPLATE_SITUATION = {
  "_type": "Situation",
  "id": "SIT_ID_PLACEHOLDER",
  "version": "1",
  "situationRecord": [
    {
      "_type": "Roadworks",
      "id": "RECORD_ID_PLACEHOLDER",
      "situationRecordCreationTime": "",
      "roadworksType": "maintenanceWork",
      "groupOfLocations": {
        "_type": "LocationByGml",
        "gmlPolygon": {
          "_type": "GmlPolygon",
          "polygon": {
            "_type": "GmlPolygonType",
            "srsName": "urn:ogc:def:crs:EPSG::4326",
            "exterior": {
              "_type": "GmlAbstractRingPropertyType",
              "linearRing": {
                "_type": "GmlLinearRingType",
                "posList": ""
              }
            }
          }
        }
      },
      "generalPublicComment": [{
        "_type": "Comment",
        "comment": ""
      }],
      "impact": {
        "_type": "Impact",
        "roadOrCarriagewayOrLaneManagements": []
      }
    }
  ],
  "validity": {
    "_type": "Validity",
    "validityTimeSpecification": {
      "_type": "TimePeriodByDurations",
      "startOfPeriod": ""
    }
  }
};

const TEMPLATE_IMPACT = {
  "_type": "RoadOrCarriagewayOrLaneManagement",
  "roadOrCarriagewayOrLaneStatus": "closed",
  "location": {
    "_type": "LocationByGml",
    "gmlLineString": {
      "_type": "GmlLineString",
      "srsName": "urn:ogc:def:crs:EPSG::4326",
      "posList": ""
    }
  }
};

/**
 * Sets script properties for InfluxDB and GCS access.
 * Run this function once manually to initialize configuration.
 */
function setInfluxDbScriptProperties() {
  const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
  
  // InfluxDB Configuration
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_URL', 'YOUR_INFLUXDB_URL');
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_TOKEN', 'YOUR_INFLUXDB_TOKEN');
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_ORG', 'YOUR_INFLUXDB_ORG');
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_BUCKET', 'YOUR_INFLUXDB_BUCKET');
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_VALIDATION_BUCKET', 'YOUR_INFLUXDB_VALIDATION_BUCKET');
  
  // Google Cloud Storage Configuration
  SCRIPT_PROPERTIES.setProperty('GCS_JSON_URL', 'YOUR_GCS_JSON_URL');
  SCRIPT_PROPERTIES.setProperty('GCS_OUTPUT_BUCKET', 'YOUR_GCS_OUTPUT_BUCKET');
  SCRIPT_PROPERTIES.setProperty('GCS_OUTPUT_FILENAME', 'datex2_output.json');
  
  Logger.log('Script properties have been set. Please replace placeholders with actual values.');
}

/**
 * Writes data to a Google Cloud Storage bucket.
 * @param {string} content The content to write.
 * @return {boolean} True if successful.
 */
function writeToGCS(content) {
  const bucket = getScriptProperty('GCS_OUTPUT_BUCKET');
  const filename = getScriptProperty('GCS_OUTPUT_FILENAME');
  
  if (!bucket || !filename) {
    Logger.log('GCS output configuration missing.');
    return false;
  }

  const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(filename)}`;
  
  try {
    const token = ScriptApp.getOAuthToken();
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      payload: content,
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200 || responseCode === 201) {
      Logger.log(`Successfully wrote Datex II to GCS: ${filename}`);
      return true;
    } else {
      Logger.log(`Error writing to GCS. Status: ${responseCode}. Body: ${response.getContentText()}`);
      return false;
    }
  } catch (e) {
    Logger.log(`Error writing to GCS: ${e.toString()}`);
    return false;
  }
}

/**
 * Retrieves segment data from a JSON file in Google Cloud Storage.
 * @return {Object} The parsed JSON data or null if an error occurs.
 */
function fetchGcsJson() {
  const url = getScriptProperty('GCS_JSON_URL');
  if (!url) {
    Logger.log('GCS_JSON_URL is not configured.');
    return null;
  }

  try {
    const token = ScriptApp.getOAuthToken();
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      Logger.log(`Error fetching JSON from GCS. Status: ${responseCode}. Body: ${response.getContentText()}`);
      return null;
    }

    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log(`Error fetching JSON from GCS: ${e.toString()}`);
    return null;
  }
}

/**
 * Extracts traffic disturbances from the provided data object.
 * @param {Object} data The data object containing segment and collision information.
 * @return {Array<Object>} A list of traffic disturbance objects.
 */
function parseTrafficDisturbances(data) {
  const trafficDisturbances = [];
  if (!data || !data.segmentId) return trafficDisturbances;

  for (const segmentId in data.segmentId) {
    const segmentData = data.segmentId[segmentId];
    if (segmentData.detailedCollisions) {
      segmentData.detailedCollisions.forEach(collision => {
        if (collision.properties) {
          trafficDisturbances.push(collision);
        }
      });
    }
  }
  return trafficDisturbances;
}

/**
 * Assembles segment data matching a specific traffic disturbance ID.
 * @param {Object} data The source data object.
 * @param {string} trafficDisturbanceId The ID to match.
 * @return {Array<Object>} A list of matching segment data objects.
 */
function assembleSegments(data, trafficDisturbanceId) {
  const matchingSegments = [];
  if (!data || !data.segmentId) return matchingSegments;

  for (const segmentId in data.segmentId) {
    const segmentData = data.segmentId[segmentId];
    if (segmentData.detailedCollisions) {
      const hasCollision = segmentData.detailedCollisions.some(collision => 
        collision.properties && collision.properties.traffic_disturbance_id === trafficDisturbanceId
      );

      if (hasCollision) {
        const segmentDataCopy = JSON.parse(JSON.stringify(segmentData));
        delete segmentDataCopy.detailedCollisions;
        segmentDataCopy.segmentId = segmentId;
        matchingSegments.push(segmentDataCopy);
      }
    }
  }
  return matchingSegments;
}

/**
 * Removes duplicate items from a list based on their serialized content.
 * @param {Array<Object>} listToClean The list to process.
 * @return {Array<Object>} A list with duplicates removed.
 */
function dropDuplicates(listToClean) {
  const seen = new Set();
  return listToClean.filter(item => {
    const serialized = JSON.stringify(item, Object.keys(item).sort());
    if (seen.has(serialized)) {
      return false;
    }
    seen.add(serialized);
    return true;
  });
}

/**
 * Filters an array to remove duplicate disturbances based on application_id.
 * @param {Array<Object>} array The array of disturbance objects.
 * @return {Array<Object>} The filtered array.
 */
function removeDuplicatesById(array) {
  const seenIds = new Set();

  return array.filter(item => {
    // Get the unique identifier (change 'application_id' to whatever key you prefer)
    const id = item.properties?.application_id;

    if (!id || seenIds.has(id)) {
      return false; // Skip if it's a duplicate or missing an ID
    }

    seenIds.add(id); // Mark this ID as seen
    return true;     // Keep the item
  });
}

/**
 * Retrieves a script property by key.
 * @param {string} key The property key.
 * @return {string} The property value.
 */
function getScriptProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Parses the CSV response from InfluxDB for validation data.
 * @param {string} csvString The CSV data string from InfluxDB.
 * @return {Array<Object>} A list of objects with segmentId and status.
 */
function parseInfluxValidationCsvResponse(csvString) {
  const data = Utilities.parseCsv(csvString);
  const result = [];

  if (data.length < 2) {
    return result;
  }

  // InfluxDB CSV usually has headers in the first non-comment row
  let headerIndex = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i][1] && !data[i][1].startsWith('_')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) return result;

  const header = data[headerIndex];
  const segmentIdIndex = header.indexOf('segmentId');
  const valueIndex = header.indexOf('_value');

  if (segmentIdIndex === -1 || valueIndex === -1) {
    return result;
  }

  for (let i = headerIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (row.length > Math.max(segmentIdIndex, valueIndex)) {
      const segmentId = row[segmentIdIndex];
      const status = row[valueIndex];
      if (segmentId) {
        result.push({ segmentId, segment_closure_status: status });
      }
    }
  }
  return result;
}

/**
 * Queries InfluxDB for segment closure status.
 * @return {Array<Object>} A list of segment validation data.
 */
function queryInfluxValidation() {
  const INFLUXDB_URL = getScriptProperty('INFLUXDB_URL');
  const INFLUXDB_TOKEN = getScriptProperty('INFLUXDB_TOKEN');
  const INFLUXDB_ORG = getScriptProperty('INFLUXDB_ORG');
  const INFLUXDB_BUCKET = getScriptProperty('INFLUXDB_VALIDATION_BUCKET');

  const FLUX_QUERY = `from(bucket: "${INFLUXDB_BUCKET}")
    |> range(start: -30m)
    |> filter(fn: (r) => r["_measurement"] == "idea_validation")
    |> filter(fn: (r) => r["_field"] == "segment_closure_status")`;

  if (!INFLUXDB_URL || !INFLUXDB_TOKEN || !INFLUXDB_ORG || !INFLUXDB_BUCKET) {
    Logger.log('InfluxDB validation properties are not set.');
    return [];
  }

  const url = `${INFLUXDB_URL}/query?org=${INFLUXDB_ORG}`;

  const options = {
    method: 'post',
    headers: {
      'Authorization': `Token ${INFLUXDB_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv'
    },
    payload: FLUX_QUERY,
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      return parseInfluxValidationCsvResponse(response.getContentText());

    } else {
      Logger.log(`InfluxDB Validation Query Failed: ${response.getContentText()}`);
      return [];
    }
  } catch (e) {
    Logger.log(`Error querying InfluxDB Validation: ${e.toString()}`);
    return [];
  }
}

/**
 * Flattens and flips coordinates from [lon, lat] to [lat, lon] for Datex II posList.
 * @param {Array} nestedArray Deeply nested coordinate array.
 * @return {string} Space-separated string of flipped coordinates.
 */
function convertCoordinates(nestedArray) {
  // 1. Flatten the deeply nested array into a single-level array of numbers
  const flatArray = nestedArray.flat(Infinity);
  
  const flippedCoordinates = [];
  
  // 2. Loop through the array in pairs of 2 (longitude, latitude)
  for (let i = 0; i < flatArray.length; i += 2) {
    const lon = flatArray[i];
    const lat = flatArray[i + 1];
    
    // 3. Push latitude first, then longitude
    flippedCoordinates.push(lat, lon);
  }
  
  // 4. Combine them into a single space-separated string
  return flippedCoordinates.join(' ');
}


/**
 * Main function to replicate the Datex II producer pipeline.
 * Fetches data, processes disturbances, and writes Datex II output to GCS.
 */
function runDatexIIProducer() {
  // Ensure script properties are set before running.
  // setInfluxDbScriptProperties(); //Depending on deployment, you may activate this to ensure that the properties are correctly set prior to running.
  
  Logger.log('Fetching disturbances data from GCS...');
  const disturbancesData = fetchGcsJson();
  if (!disturbancesData) return;

  const disturbanceList = parseTrafficDisturbances(disturbancesData);
  const uniqueDisturbances = removeDuplicatesById(disturbanceList);

  Logger.log('Total disturbances found: ' + disturbanceList.length);
  Logger.log('Unique disturbances after filtering: ' + uniqueDisturbances.length);
  
  Logger.log('Querying InfluxDB for segment statuses...');
  const segmentStatusList = queryInfluxValidation();

  const datexObject = JSON.parse(JSON.stringify(TEMPLATE_DATEX_OBJECT));
  datexObject.publicationTime = new Date().toISOString().split('.')[0] + 'Z';

  uniqueDisturbances.forEach(item => {
    const segmentsList = assembleSegments(disturbancesData, item.properties.traffic_disturbance_id);
    const situationObject = JSON.parse(JSON.stringify(TEMPLATE_SITUATION));

    // Map properties to Situation Record
    situationObject.id = item.properties.traffic_disturbance_id;
    situationObject.situationRecord[0]._type = "Roadworks";
    situationObject.situationRecord[0].id = item.properties.application_id;
    situationObject.situationRecord[0].situationRecordCreationTime = item.properties.star_date;
    
    if (item.properties.traffic_disturbance_type == "Aluevuokraus") {
      situationObject.situationRecord[0].roadworksType = "Other";
    } else {
      situationObject.situationRecord[0].roadworksType = "Excavation";
    }

    // Convert geometry to posList
    situationObject.situationRecord[0].groupOfLocations.gmlPolygon.polygon.exterior.linearRing.posList = convertCoordinates(item.geometry.coordinates);

    // Build comment string
    let template = "Ongoing maintenance work in district ";
    let comment = template.concat(item.properties.district, " at address: ", item.properties.address); 
    situationObject.situationRecord[0].generalPublicComment[0].comment = comment;

    // Process individual segments as impacts
    segmentsList.forEach(segment => {
      const impactObject = JSON.parse(JSON.stringify(TEMPLATE_IMPACT));
      
      // Default status
      impactObject.roadOrCarriagewayOrLaneStatus = 'undetermined';

      // Match with InfluxDB validation status
      const validatedSegment = segmentStatusList.find(s => s.segmentId === segment.segmentId);
      if (validatedSegment) {
        impactObject.roadOrCarriagewayOrLaneStatus = validatedSegment.segment_closure_status;
      }

      // Process LineString Geometry
      if (segment.geometry && segment.geometry.coordinates) {
        const posList = segment.geometry.coordinates
          .map(coord => `${coord[1]} ${coord[0]}`) // [lat lon] -> [lat lon] string
          .join(' ');
        impactObject.location.gmlLineString.posList = posList;
      }

      situationObject.situationRecord[0].impact.roadOrCarriagewayOrLaneManagements.push(impactObject);
    });

    datexObject.situation.push(situationObject);
  });

  const outputString = JSON.stringify(datexObject, null, 2);
  Logger.log('Datex II object assembled. Writing to GCS...');
  writeToGCS(outputString);
}
