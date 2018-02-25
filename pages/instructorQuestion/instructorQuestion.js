var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();
var csvStringify = require('csv').stringify;

var async = require('async');
var error = require('../../lib/error');
var question = require('../../lib/question');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');
var debug = require('debug')('prairielearn:instructorQuestion');

var sql = sqlLoader.loadSqlEquiv(__filename);
const path = require('path');
var fs = require('fs');
var sanitizeName = function(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
};

var filenames = function(locals) {
    var prefix = sanitizeName(locals.course.short_name)
        + '_'
        + sanitizeName(locals.course_instance.short_name)
        + '_'
        + sanitizeName(locals.question.qid + '')
        + '_';
    return {
        assessmentStatsCsvFilename:       prefix + 'assessment_stats.csv',
    };
};

function processSubmission(req, res, callback) {
    let variant_id, submitted_answer;
    if (res.locals.question.type == 'Freeform') {
        variant_id = req.body.__variant_id;
        submitted_answer = _.omit(req.body, ['__action', '__csrf_token', '__variant_id']);
    } else {
        if (!req.body.postData) return callback(error.make(400, 'No postData', {locals: res.locals, body: req.body}));
        let postData;
        try {
            postData = JSON.parse(req.body.postData);
        } catch (e) {
            return callback(error.make(400, 'JSON parse failed on body.postData', {locals: res.locals, body: req.body}));
        }
        variant_id = postData.variant ? postData.variant.id : null;
        submitted_answer = postData.submittedAnswer;
    }
    const submission = {
        variant_id: variant_id,
        auth_user_id: res.locals.authn_user.user_id,
        submitted_answer: submitted_answer,
    };
    sqldb.callOneRow('variants_ensure_question', [submission.variant_id, res.locals.question.id], (err, result) => {
        if (ERR(err, callback)) return;
        const variant = result.rows[0];
        if (req.body.__action == 'grade') {
            question.saveAndGradeSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
                if (ERR(err, callback)) return;
                callback(null, submission.variant_id);
            });
        } else if (req.body.__action == 'save') {
            question.saveSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
                if (ERR(err, callback)) return;
                callback(null, submission.variant_id);
            });
        } else {
            callback(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
        }
    });
}

function processIssue(req, res, callback) {
    const description = req.body.description;
    if (!_.isString(description) || description.length == 0) {
        return callback(new Error('A description of the issue must be provided'));
    }

    const variant_id = req.body.__variant_id;
    sqldb.callOneRow('variants_ensure_question', [variant_id, res.locals.question.id], (err, _result) => {
        if (ERR(err, callback)) return;

        const course_data = _.pick(res.locals, ['variant', 'question', 'course_instance', 'course']);
        const params = [
            variant_id,
            description, // student message
            'instructor-reported issue', // instructor message
            true, // manually_reported
            true, // course_caused
            course_data,
            {}, // system_data
            res.locals.authn_user.user_id,
        ];
        sqldb.call('issues_insert_for_variant', params, (err) => {
            if (ERR(err, callback)) return;
            callback(null, variant_id);
        });
    });
}

router.post('/', function(req, res, next) {
    // console.log("Hi");
    // console.log(req.body.title_value);
    if (req.body.__action == 'edit_title') {
        // console.log(req.body.question_id);
        // console.log(req.body.title_value);
        var sql = "UPDATE questions SET title = ";
        sql += '\''+ req.body.title_value + '\'';
        sql += " WHERE id = ";
        sql += req.body.question_id;
        console.log(sql);
        sqldb.query(sql, {}, function (err, result){
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
        question_dir = path.join(res.locals.course.path, 'questions', res.locals.question.directory);
        filePath = path.join(question_dir, 'info.json');
        fs.readFile(filePath, { encoding: 'utf-8' }, function (err, content) {
            if (!err) {
                console.log(content);
                var new_content = JSON.parse(content);
                new_content.title = req.body.title_value;
                
                fs.writeFile(filePath, JSON.stringify(new_content), function (err) {
                if (err) {
                    return console.log(err);
                }
                console.log("The file was saved!");
                console.log(new_content);
            });

            } else {
                console.log(err);
            }
        });
    }
    else if (req.body.__action == 'edit_qid') {
        console.log("ID");
        var sql = "UPDATE questions SET  qid= ";
        sql += '\'' + req.body.qid_value + '\'';
        sql += " WHERE id = ";
        sql += req.body.question_id;
        console.log(sql);
        sqldb.query(sql, {}, function (err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
        
    
    }
    else if (req.body.__action == 'edit_type') {
        var sql = "UPDATE questions SET type = ";
        sql += '\'' + req.body.type_value + '\'';
        sql += " WHERE id = ";
        sql += req.body.question_id;
        console.log(sql);
        sqldb.query(sql, {}, function (err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
        // question_dir = path.join(res.locals.course.path, 'questions', res.locals.question.directory);
        // filePath = path.join(question_dir, 'info.json');
        // fs.readFile(filePath, { encoding: 'utf-8' }, function (err, content) {
        //     if (!err) {
        //         console.log(content);
        //         var new_content = JSON.parse(content);
        //         new_content.type = req.body.type_value;

        //         fs.writeFile(filePath, JSON.stringify(new_content), function (err) {
        //             if (err) {
        //                 return console.log(err);
        //             }
        //             console.log("The file was saved!");
        //             console.log(new_content);
        //         });

        //     } else {
        //         console.log(err);
        //     }
        // });
    }
    else if (req.body.__action == 'edit_topic') {
        var sql = "UPDATE questions SET topic_id = ";
        sql += "(SELECT id FROM topics WHERE name = ";
        sql += '\'' + req.body.topic_value + '\''+ ")";
        sql += " WHERE id = ";
        sql += req.body.question_id;
        console.log(sql);
        console.log(req.body.topic_value);
        sqldb.query(sql, {}, function (err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
        question_dir = path.join(res.locals.course.path, 'questions', res.locals.question.directory);
        filePath = path.join(question_dir, 'info.json');
        fs.readFile(filePath, { encoding: 'utf-8' }, function (err, content2) {
            if (!err) {
                console.log(content2);
                var new_content = JSON.parse(content2);
                new_content.topic= req.body.topic_value;
                fs.writeFile(filePath, JSON.stringify(new_content), function (err) {
                    if (err) {
                        return console.log(err);
                    }
                    console.log("The file was saved!");
                    console.log(new_content);
                });

            } else {
                console.log(err);
            }
        });
    }

    else if (req.body.__action == 'grade' || req.body.__action == 'save') {
        processSubmission(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/question/' + res.locals.question.id
                         + '/?variant_id=' + variant_id);
        });
    } else if (req.body.__action == 'test_once') {
        const count = 1;
        const showDetails = true;
        question.startTestQuestion(count, showDetails, res.locals.question, res.locals.course, res.locals.authn_user.user_id, (err, job_sequence_id) => {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'test_100') {
        const count = 100;
        const showDetails = false;
        question.startTestQuestion(count, showDetails, res.locals.question, res.locals.course, res.locals.authn_user.user_id, (err, job_sequence_id) => {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'report_issue') {
        console.log(req.body.description)
        processIssue(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/question/' + res.locals.question.id
                         + '/?variant_id=' + variant_id);
        });
    } else if (req.body.__action == 'update_question') {
        const updated_question_content = req.body.updated_question_content;
        question_dir = path.join(res.locals.course.path, 'questions', res.locals.question.directory);
        filePath = path.join(question_dir, 'question.html');  // TODO: user-defined files
        fs.writeFile(filePath, updated_question_content, function(err) {
            if(err) {
                return console.log(err);
            }
            console.log("The file was saved!");
        }); 
        res.redirect(res.locals.urlPrefix + '/question/' + res.locals.question.id);
    } else {
        return next(new Error('unknown __action: ' + req.body.__action));
    }
});

router.get('/', function(req, res, next) {

    async.series([
        (callback) => {
            question_dir = path.join(res.locals.course.path, 'questions', res.locals.question.directory);
            
            filePath = path.join(question_dir, 'question.html');
            fs.readFile(filePath, {encoding: 'utf-8'}, function(err,data){
                if (!err) {
                    res.locals.question_content_base64 = Buffer.from(data).toString('base64');
                    res.locals.question_path = filePath;
                } else {
                    console.log(err);
                }
            });
            callback(null);
        },
        (callback) => {
            debug('set filenames');
            _.assign(res.locals, filenames(res.locals));
            callback(null);
        },
        (callback) => {
            sqldb.query(sql.assessment_question_stats, {question_id: res.locals.question.id}, function(err, result) {
                if (ERR(err, callback)) return;
                // console.warn(results.length);
                res.locals.assessment_stats = result.rows;
                callback(null);
            });
        },
        (callback) => {
            sqldb.query(sql.get_topics, { course_id: res.locals.course.id }, function (err, result) {
                if (ERR(err, callback)) return;
                // console.log(res.locals.course.id)
                // console.log("Hi")
                // console.log(result.rows[0])
                res.locals.topics = result.rows[0].topics;
                callback(null);
            });
        },
        (callback) => {
            sqldb.query(sql.get_tags, { course_id: res.locals.course.id }, function (err, result) {
                if (ERR(err, callback)) return;
                // console.log(res.locals.course.id)
                // console.log(result.rows[0])
                res.locals.alltags = result.rows[0].tags;
                callback(null);
            });
        },
        (callback) => {
            sqldb.query(sql.get_types, {}, function (err, result) {
                // console.log(result.rows);
                if (ERR(err, callback)) return;
                res.locals.alltypes = result.rows;
                // console.log(res.locals.alltypes);
                callback(null);
            });
        },
        (callback) => {
            res.locals.question_attempts_histogram = null;
            res.locals.question_attempts_before_giving_up_histogram = null;
            res.locals.question_attempts_histogram_hw = null;
            res.locals.question_attempts_before_giving_up_histogram_hw = null;
            // res.locals.question_attempts_histogram = res.locals.result.question_attempts_histogram;
            // res.locals.question_attempts_before_giving_up_histogram = res.locals.result.question_attempts_before_giving_up_histogram;
            // res.locals.question_attempts_histogram_hw = res.locals.result.question_attempts_histogram_hw;
            // res.locals.question_attempts_before_giving_up_histogram_hw = res.locals.result.question_attempts_before_giving_up_histogram_hw;
            callback(null);
        },
        (callback) => {
            // req.query.variant_id might be undefined, which will generate a new variant
            question.getAndRenderVariant(req.query.variant_id, res.locals, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            res.locals.questionGHLink = null;
            if (res.locals.course.repository) {
                const GHfound = res.locals.course.repository.match(/^git@github.com:\/?(.+?)(\.git)?\/?$/);
                if (GHfound) {
                    if (GHfound[1] == 'PrairieLearn/PrairieLearn') {
                        // this is exampleCourse, so handle it specially
                        res.locals.questionGHLink = 'https://github.com/' + GHfound[1] + '/tree/master/exampleCourse/questions/' + res.locals.question.qid;
                    } else {
                        res.locals.questionGHLink = 'https://github.com/' + GHfound[1] + '/tree/master/questions/' + res.locals.question.qid;
                    }
                }
            }
            callback(null);
        },
    ], (err) => {
        if (ERR(err, next)) return;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.get('/:filename', function(req, res, next) {
    _.assign(res.locals, filenames(res.locals));

    if (req.params.filename === res.locals.assessmentStatsCsvFilename) {
        sqldb.query(sql.assessment_question_stats, {question_id: res.locals.question.id}, function(err, result) {
            if (ERR(err, next)) return;
            var questionStatsList = result.rows;
            var csvData = [];
            var csvHeaders = ['Course instance', 'Assessment'];
            Object.keys(res.locals.stat_descriptions).forEach(key => {
                csvHeaders.push(res.locals.stat_descriptions[key].non_html_title);
            });

            csvData.push(csvHeaders);

            _(questionStatsList).each(function(questionStats) {
                var questionStatsData = [];
                questionStatsData.push(questionStats.course_title);
                questionStatsData.push(questionStats.label);
                questionStatsData.push(questionStats.mean_question_score);
                questionStatsData.push(questionStats.question_score_variance);
                questionStatsData.push(questionStats.discrimination);
                questionStatsData.push(questionStats.some_submission_perc);
                questionStatsData.push(questionStats.some_perfect_submission_perc);
                questionStatsData.push(questionStats.some_nonzero_submission_perc);
                questionStatsData.push(questionStats.average_first_submission_score);
                questionStatsData.push(questionStats.first_submission_score_variance);
                questionStatsData.push(questionStats.first_submission_score_hist);
                questionStatsData.push(questionStats.average_last_submission_score);
                questionStatsData.push(questionStats.last_submission_score_variance);
                questionStatsData.push(questionStats.last_submission_score_hist);
                questionStatsData.push(questionStats.average_max_submission_score);
                questionStatsData.push(questionStats.max_submission_score_variance);
                questionStatsData.push(questionStats.max_submission_score_hist);
                questionStatsData.push(questionStats.average_average_submission_score);
                questionStatsData.push(questionStats.average_submission_score_variance);
                questionStatsData.push(questionStats.average_submission_score_hist);
                questionStatsData.push(questionStats.submission_score_array_averages);
                questionStatsData.push(questionStats.incremental_submission_score_array_averages);
                questionStatsData.push(questionStats.incremental_submission_points_array_averages);
                questionStatsData.push(questionStats.average_number_submissions);
                questionStatsData.push(questionStats.number_submissions_variance);
                questionStatsData.push(questionStats.number_submissions_hist);
                questionStatsData.push(questionStats.quintile_question_scores);

                _(questionStats.quintile_scores).each(function(perc) {
                    questionStatsData.push(perc);
                });

                csvData.push(questionStatsData);
            });

            csvStringify(csvData, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else {
        next(new Error('Unknown filename: ' + req.params.filename));
    }
});
module.exports = router;
