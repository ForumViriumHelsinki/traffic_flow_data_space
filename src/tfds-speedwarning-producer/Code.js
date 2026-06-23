/**
 * @file Code.js
 * @description This script queries traffic segment data from InfluxDB, filters it based on speed ratios, 
 * and exports the results as a GeoJSON FeatureCollection to Google Cloud Storage (GCS).
 */

/**
 * Sets script properties for InfluxDB and GCS access.
 * This function should be run once to configure the script environment.
 * Replace the placeholder values with your actual configuration before running.
 */
function setInfluxDbScriptProperties() {
  const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
  
  // InfluxDB Configuration
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_URL', 'REPLACE_WITH_YOUR_INFLUXDB_URL');
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_TOKEN', 'REPLACE_WITH_YOUR_INFLUXDB_TOKEN');
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_ORG', 'REPLACE_WITH_YOUR_INFLUXDB_ORG');
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_BUCKET', 'REPLACE_WITH_YOUR_INFLUXDB_BUCKET');
  
  // Google Cloud Storage Configuration
  // URL to the JSON file containing segment geometry mapping
  SCRIPT_PROPERTIES.setProperty('GCS_JSON_URL', 'REPLACE_WITH_YOUR_GCS_JSON_URL');
  // Target bucket for the output GeoJSON
  SCRIPT_PROPERTIES.setProperty('GCS_OUTPUT_BUCKET', 'REPLACE_WITH_YOUR_GCS_OUTPUT_BUCKET');
  // Filename for the output GeoJSON
  SCRIPT_PROPERTIES.setProperty('GCS_OUTPUT_FILENAME', 'filtered_segments.json');
  
  Logger.log('Script properties have been initialized with placeholders. Please update them with your actual values.');
}

/**
 * Writes the generated GeoJSON content to a Google Cloud Storage bucket.
 * 
 * @param {string} content The JSON string content to write.
 * @return {boolean} True if the write operation was successful, false otherwise.
 */
function writeToGCS(content) {
  const bucket = getScriptProperty('GCS_OUTPUT_BUCKET');
  const filename = getScriptProperty('GCS_OUTPUT_FILENAME');
  
  if (!bucket || !filename) {
    Logger.log('Error: GCS output configuration (bucket or filename) is missing.');
    return false;
  }

  // Use the GCS JSON API for uploads
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
      Logger.log(`Successfully uploaded GeoJSON to GCS bucket "${bucket}" as "${filename}".`);
      return true;
    } else {
      Logger.log(`Failed to write to GCS. Status: ${responseCode}. Response: ${response.getContentText()}`);
      return false;
    }
  } catch (e) {
    Logger.log(`Exception during GCS write: ${e.toString()}`);
    return false;
  }
}

/**
 * Retrieves segment geometry from a JSON mapping file in Google Cloud Storage.
 * This function uses the script's OAuth token to access the bucket.
 * 
 * @return {Object.<string, Object>|null} A dictionary mapping segment IDs to geometry data, or null on error.
 */
function fetchSegmentGeometry() {
  const url = getScriptProperty('GCS_JSON_URL');
  if (!url || url === 'REPLACE_WITH_YOUR_GCS_JSON_URL') {
    Logger.log('Error: GCS_JSON_URL is not configured.');
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
      Logger.log(`Failed to fetch segment geometry. Status: ${responseCode}. Response: ${response.getContentText()}`);
      return null;
    }

    const json = JSON.parse(response.getContentText());
    
    // Support both direct dictionaries and objects containing a "segmentId" key
    return json.segmentId || json;
  } catch (e) {
    Logger.log(`Exception during geometry fetch: ${e.toString()}`);
    return null;
  }
}

/**
 * Merges speed data from InfluxDB with geometry data from GCS.
 * 
 * @param {Object.<string, Object>} speedData Data dictionary from InfluxDB.
 * @param {Object.<string, Object>} geometryData Geometry dictionary from GCS.
 * @return {Object.<string, Object>} Merged data dictionary.
 */
function mergeSpeedAndGeometry(speedData, geometryData) {
  if (!geometryData) return speedData;

  const mergedData = {};
  for (const segmentId in speedData) {
    if (speedData.hasOwnProperty(segmentId)) {
      mergedData[segmentId] = {
        ...speedData[segmentId],
        geometry: geometryData[segmentId] ? geometryData[segmentId].geometry : null
      };
    }
  }
  return mergedData;
}

/**
 * Retrieves a script property by its key.
 * 
 * @param {string} key The key of the property to retrieve.
 * @return {string|null} The value of the property, or null if not found.
 */
function getScriptProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Parses the CSV response from InfluxDB into a dictionary.
 * The resulting dictionary maps segment IDs to objects containing speed data.
 * 
 * @param {string} csvString The raw CSV response from InfluxDB.
 * @return {Object.<string, Object>} A dictionary with segmentId as key.
 */
function parseInfluxCsvResponse(csvString) {
  const data = Utilities.parseCsv(csvString);
  const result = {};

  if (data.length < 2) {
    Logger.log('Warning: No data or only header found in InfluxDB response.');
    return result;
  }

  const header = data[0];
  const segmentIdIndex = header.indexOf('segmentId');
  const currentSpeedIndex = header.indexOf('currentSpeed');
  const typicalSpeedIndex = header.indexOf('typicalSpeed');

  if (segmentIdIndex === -1 || currentSpeedIndex === -1 || typicalSpeedIndex === -1) {
    Logger.log('Error: Required columns (segmentId, currentSpeed, typicalSpeed) not found in CSV header.');
    return result;
  }

  // Iterate starting from the second row to skip the header
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const segmentId = row[segmentIdIndex];
    const currentSpeed = parseFloat(row[currentSpeedIndex]);
    const typicalSpeed = parseFloat(row[typicalSpeedIndex]);

    if (segmentId) {
      result[segmentId] = {
        currentSpeed: isNaN(currentSpeed) ? null : currentSpeed,
        typicalSpeed: isNaN(typicalSpeed) ? null : typicalSpeed
      };
    }
  }
  return result;
}

/**
 * Calculates the ratio of current speed to typical speed for each segment.
 * 
 * @param {Object.<string, Object>} influxData Dictionary containing current and typical speeds.
 * @return {Object.<string, Object>} Updated dictionary with 'speedRatio' added.
 */
function calculateSpeedRatio(influxData) {
  const dataWithRatio = {};
  for (const segmentId in influxData) {
    if (influxData.hasOwnProperty(segmentId)) {
      const segment = influxData[segmentId];
      const currentSpeed = segment.currentSpeed;
      const typicalSpeed = segment.typicalSpeed;
      let speedRatio = null;

      if (typeof currentSpeed === 'number' && typeof typicalSpeed === 'number' && typicalSpeed !== 0) {
        speedRatio = currentSpeed / typicalSpeed;
      }

      dataWithRatio[segmentId] = {
        ...segment,
        speedRatio: speedRatio
      };
    }
  }
  return dataWithRatio;
}

/**
 * Filters segments based on whether their speed ratio is below a specified threshold.
 * 
 * @param {Object.<string, Object>} dataWithRatio Data dictionary containing speed ratios.
 * @param {number} threshold The speed ratio threshold (e.g., 0.25).
 * @return {Object.<string, Object>} Filtered dictionary.
 */
function filterBySpeedRatio(dataWithRatio, threshold) {
  const filteredData = {};
  for (const segmentId in dataWithRatio) {
    if (dataWithRatio.hasOwnProperty(segmentId)) {
      const segment = dataWithRatio[segmentId];
      if (segment.speedRatio !== null && segment.speedRatio < threshold) {
        filteredData[segmentId] = segment;
      }
    }
  }
  return filteredData;
}

/**
 * Queries InfluxDB using a Flux query and processes the result.
 * 
 * @param {number} [threshold] Optional: Speed ratio threshold to filter results.
 * @return {Object.<string, Object>|null} Processed and optionally filtered results.
 */
function queryInfluxDB(threshold) {
  const INFLUXDB_URL = getScriptProperty('INFLUXDB_URL');
  const INFLUXDB_TOKEN = getScriptProperty('INFLUXDB_TOKEN');
  const INFLUXDB_ORG = getScriptProperty('INFLUXDB_ORG');
  const INFLUXDB_BUCKET = getScriptProperty('INFLUXDB_BUCKET');

  if (!INFLUXDB_URL || !INFLUXDB_TOKEN || !INFLUXDB_ORG || !INFLUXDB_BUCKET || INFLUXDB_TOKEN.startsWith('REPLACE_')) {
    Logger.log('Error: InfluxDB properties are not correctly configured. Please run setInfluxDbScriptProperties() and update the values.');
    return null;
  }

  const FLUX_QUERY = `from(bucket: "${INFLUXDB_BUCKET}")
  |> range(start: -10m)
  |> filter(fn: (r) => r["_measurement"] == "segment_data" and
                                 (r["_field"] == "currentSpeed" or
                                  r["_field"] == "typicalSpeed"))
  |> group(columns: ["segmentId", "_field"])
  |> last()
  |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["segmentId", "currentSpeed", "typicalSpeed"])`;

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
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode === 200) {
      Logger.log('InfluxDB query successful.');
      const parsedData = parseInfluxCsvResponse(responseBody);
      let results = calculateSpeedRatio(parsedData);

      // Merge with geometry data if available
      const geometryData = fetchSegmentGeometry();
      if (geometryData) {
        results = mergeSpeedAndGeometry(results, geometryData);
        Logger.log('Merged speed data with segment geometry.');
      }

      // Apply filtering if a threshold is provided
      if (threshold !== undefined) {
        results = filterBySpeedRatio(results, threshold);
        Logger.log(`Filtered results by speed ratio threshold: ${threshold}`);
      }

      return results;
    } else {
      Logger.log(`InfluxDB query failed (Status: ${responseCode}). Response: ${responseBody}`);
      return null;
    }
  } catch (e) {
    Logger.log(`Exception during InfluxDB query: ${e.toString()}`);
    return null;
  }
}

/**
 * Extracts the midpoint from a LineString geometry.
 * 
 * @param {Object} geometry GeoJSON-like geometry object.
 * @return {Array<number>|null} [longitude, latitude] of the midpoint, or null.
 */
function getMiddlemostPoint(geometry) {
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    return null;
  }
  const coords = geometry.coordinates;
  if (coords.length === 0) return null;
  
  const middleIndex = Math.floor(coords.length / 2);
  return coords[middleIndex];
}

/**
 * Converts the processed segment data into a GeoJSON FeatureCollection of midpoints.
 * 
 * @param {Object.<string, Object>} filteredData Dictionary of processed segments.
 * @return {Object} GeoJSON FeatureCollection.
 */
function convertToGeoJsonPoints(filteredData) {
  const features = [];
  
  for (const segmentId in filteredData) {
    if (filteredData.hasOwnProperty(segmentId)) {
      const segment = filteredData[segmentId];
      const middlePoint = getMiddlemostPoint(segment.geometry);
      
      if (middlePoint) {
        features.push({
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": middlePoint
          },
          "properties": {
            "segmentId": segmentId,
            "currentSpeed": segment.currentSpeed,
            "typicalSpeed": segment.typicalSpeed,
            "speedRatio": segment.speedRatio
          }
        });
      }
    }
  }
  
  return {
    "type": "FeatureCollection",
    "features": features
  };
}

/**
 * Main execution function to trigger the segment analysis and export process.
 * This function queries InfluxDB, processes the data, and writes the output to GCS.
 * 
 * @return {Object|null} The generated GeoJSON FeatureCollection, or null if no data was processed.
 */
function run() {
  // setInfluxDbScriptProperties() //Depending on the deployment, you may toggle this to ensure the config is set prior to run.
  // Speed ratio threshold: segments with currentSpeed/typicalSpeed below this value will be included.
  const SPEED_RATIO_THRESHOLD = 0.25; 
  
  Logger.log(`Starting execution with speed ratio threshold: ${SPEED_RATIO_THRESHOLD}...`);
  
  const result = queryInfluxDB(SPEED_RATIO_THRESHOLD);
  
  if (result && Object.keys(result).length > 0) {
    const geoJson = convertToGeoJsonPoints(result);
    const geoJsonString = JSON.stringify(geoJson, null, 2);
    
    Logger.log('Generated GeoJSON FeatureCollection of segment midpoints.');
    
    // Write the resulting GeoJSON to Google Cloud Storage
    const success = writeToGCS(geoJsonString);
    
    if (success) {
      Logger.log('Process completed successfully.');
    } else {
      Logger.log('Process completed with errors during GCS export.');
    }
    
    return geoJson;
  } else {
    Logger.log('No segments found below threshold or no data returned from InfluxDB.');
    return null;
  }
}
