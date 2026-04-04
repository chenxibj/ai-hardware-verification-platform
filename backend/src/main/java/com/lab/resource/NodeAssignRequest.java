package com.lab.resource;

import lombok.Data;
import java.util.List;

@Data
public class NodeAssignRequest {
    private List<Long> nodeIds;
}
