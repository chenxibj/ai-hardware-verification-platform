package com.lab.task;
import lombok.Data;
@Data
public class CreateTaskRequest {
    private String name;
    private String description;
    private String evalType;
    private String targetModel;
    private String datasetIds;
    private String priority;
    private String tags;
}
