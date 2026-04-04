package com.lab.node;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ComputeNodeRepository extends JpaRepository<ComputeNode, Long> {
    Optional<ComputeNode> findByName(String name);
    List<ComputeNode> findByStatus(ComputeNode.Status status);
    List<ComputeNode> findByResourcePoolId(Long resourcePoolId);
}
