const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const elasticsearch = require('elasticsearch');
const csv = require('fast-csv');
const uuid = require('uuid');
const Promise = require('bluebird');

function elasticsearch_csv (options) {
    this.options = options || {};

    if (!this.options.es || !this.options.es.index) {
        throw new Error('index is invalid or missing');
    }
    if (!this.options.es || !this.options.es.type) {
        throw new Error('type is invalid or missing');
    }
    if (!this.options.csv || !this.options.csv.filePath) {
        throw new Error('filePath is invalid or missing');
    }
    try {
        stats = fs.lstatSync(path.resolve(this.options.csv.filePath));

        if (stats.isDirectory()) {
            throw new Error('file is a directory');
        }
    } catch (err) {
        throw err;
    }

    this.esClient = new elasticsearch.Client(_.omit(this.options.es, ['index','type']));

    return this;
}

elasticsearch_csv.prototype = {
    parse: function () {
        return new Promise((function (resolve, reject) {
            let request = {
                    body: []
                },
                stream = fs.createReadStream(this.options.csv.filePath),
                csvStream = csv(_.omit(this.options.csv, ['filePath']))
                    .on('data', (function (data) {
                        if (_.isPlainObject(data)) {
                            request.body.push({ index: { _index: this.options.es.index, _type: this.options.es.type, _id: uuid.v4() } });
                            _.forEach(data, function (value, key) {
                                try {
                                    data[key] = JSON.parse(value);
                                } catch (ignore) {}
                            });
                            request.body.push(data);
                        } else {
                            reject(new Error('Data and/or options have no headers specified'));
                        }
                    }).bind(this))
                    .on('end', function () {
                        resolve(request);
                    })
                    .on('data-invalid', reject);

            stream.pipe(csvStream);
        }).bind(this));
    },
    import: function () {
        return new Promise((function (resolve, reject) {
            this.parse().then((function (request) {
                this.esClient.bulk(request, function (err, res) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(res);
                    }
                });
            }).bind(this), reject);
        }).bind(this));
    }
};

module.exports = elasticsearch_csv;
