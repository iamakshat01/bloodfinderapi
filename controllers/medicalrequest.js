const mongoose = require('mongoose');
const Med = require('../models/medicalOrg');
const Request = require('../models/requestModel');
const Pool = require('../models/requestPoolModel');

module.exports.getGeneratedRequests = (req,res,next) => {
    Request.aggregate([{$match: {medOrg: mongoose.Types.ObjectId(req.medOrg.id) }}, {$sort: {status:-1, createdAt: -1}}]).then(reqs => {
        res.status(200).json({
            response: reqs
        });
    }).catch(err => {
        next(err);
    });
};

module.exports.generateRequest = (req,res,next) => {
    var newReq = {
        blood_group: req.body.blood_group,
        units: req.body.units,
        medOrg: req.medOrg.id
    };
    var donors_list = req.body.donors_list;
    
    Request.insertMany(newReq).then(request => {
        var req_id = request[0]._id;
        var poolRequest = donors_list.map(donor => {
            return {
                donor: donor,
                request: req_id
            };
        });
        Pool.insertMany(poolRequest).then(requests => {
            res.status(200).json({
                response: 'Request has been successfully created.'
            });
        }).catch(err => {
            Request.deleteOne({_id: req_id});
            var error = new Error('Request could not be generated.');
            error.status = 400;
            throw error;
        })
    }).catch(err => {
        next(err);
    });
}

module.exports.getGeneratedRequestById = (req,res,next) => {
    Request.find({_id: req.params.req_id, medOrg: req.medOrg.id}).then(request => {
        if(!request.length){
            var error = new Error('No such request found!');
            error.code = 400;
            throw error;
        }
        else{
            Pool.aggregate([
                {
                    $match: {
                        request: request[0]._id
                    }
                },
                {
                    $lookup: {
                        from: 'donors',
                        // localField: "donor",
                        // foreignField: "_id",
                        let: {donor_: '$donor', status_:'$response'},
                        pipeline: [
                            {
                                $match: {
                                    $expr:{
                                        $eq: ['$_id','$$donor_']
                                    }
                                }
                            },
                            {
                                $project: {
                                    username: 1,
                                    location: 1,
                                    phone: {
                                        $cond:{
                                            if:{
                                                $eq:['$$status_','accepted']
                                            },
                                            then:'$phone',
                                            else: '$false'
                                      }
                                    },
                                    email: {
                                        $cond:{
                                            if:{
                                            $eq:['$$status_','accepted']
                                            },
                                            then:'$email',
                                            else: '$false'
                                      }
                                    },
                                    name: 1
                                }
                            }
                        ],
                        as: 'donor'
                    }
                },
                {
                    $unwind: '$donor'
                },
                {
                    $group: {
                        _id: '$response',
                        donors: {
                            $addToSet: "$donor"
                        }
                    }
                }
            ]).then(reqInfo=> {
                res.status(200).json({
                    request: request[0],
                    responses: reqInfo
                });
            }).catch(err=>{
                next(err);
            })
        }
    })
    .catch(err => {
        next(err);
    });
};

module.exports.deleteGeneratedRequest = (req,res,next) => {
    Request.deleteOne({_id: req.params.req_id, medOrg: req.medOrg.id})
    .then(val => {
        Pool.deleteMany({request: mongoose.Types.ObjectId(req.params.req_id)}).then(val => {
            res.status(200).json({
                response: 'Request has been successfully deleted.'
            });
        }).catch(err => {
            throw err;
        });
    })
    .catch(err => {
        next(err);
    });
};

module.exports.getResponses = (req,res,next) => {
    Request.find({_id: req.params.req_id, medOrg: req.medOrg.id})
    .then(reqs => {
        if(!reqs.length){
            var error = new Error('No such request found!');
            error.code = 400;
            throw error;
        }
        else{
            Pool.aggregate([
                {$match: {
                    request: mongoose.Types.ObjectId(req.params.req_id)
                }},
                {$group: {
                    _id: '$response',
                    donors_list: {$addToSet: '$donor'}
                }},
                {$lookup: {
                    from: 'donors',
                    localField: 'donors_list',
                    foreignField: '_id',
                    as: 'donordetails'
                }},
                {$replaceRoot: {newRoot: {
                    status: '$_id',
                    donors: '$donordetails'
                }}
                }
            ]).then(responses => {
                res.status(200).json({
                    response: responses
                });
            }).catch(err => {
                throw err;
            });
        }
    }).catch(err => {
        next(err);
    });
};